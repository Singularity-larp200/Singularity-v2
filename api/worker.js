const OBF_KEY = [173, 91, 202, 17, 138, 64, 229, 53];

const PROVIDERS = {
	gemini: {
		keys: "GEMINI_KEYS",
		models: ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash"],
	},
	deepseek: {
		keys: "DEEPSEEK_KEYS",
		models: ["deepseek-chat", "deepseek-reasoner"],
	},
	claude: {
		keys: "CLAUDE_KEYS",
		models: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"],
	},
	ollama: {
		keys: "OLLAMA_KEYS",
		models: ["gpt-oss:120b", "gpt-oss:20b", "deepseek-v3.1:671b"],
	},
};
const RETRY_STATUSES = [401, 403, 429, 500, 502, 503];
const MAX_CONTENT_CHARS = 4000000;
const MAX_TURNS = 40;

const IMPORT_MAX_TRACKS = 300;

const IMPORT_HOSTS = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|spotify\.link)$/i;
const SHORT_LINK_HOSTS = /^(spotify\.link|youtu\.be)$/i;

const listKeys = (value) => (value || "").split(",").map((s) => s.trim()).filter(Boolean);

const clamp = (value, fallback, min, max) => {
	const n = Number(value);
	return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

const obf = (buf) => {
	const out = Buffer.alloc(buf.length);
	for (let i = 0; i < buf.length; i++) {
		out[i] = buf[i] ^ OBF_KEY[i % OBF_KEY.length] ^ (i & 255);
	}
	return out;
};

async function readRaw(req) {
	if (Buffer.isBuffer(req.body)) return req.body;
	if (req.body !== undefined) return null;
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	return Buffer.concat(chunks);
}

function makeReply(res, binary) {
	const reply = (status, obj) => {
		if (binary) {
			res.setHeader("Content-Type", "application/octet-stream");
			return res.status(status).send(obf(Buffer.from(JSON.stringify(obj), "utf8")));
		}
		return res.status(status).json(obj);
	};
	reply.binary = binary;
	return reply;
}

async function youtubeSearch(rawQuery, rawLimit, reply, res) {
	const q = String(rawQuery || "").trim().slice(0, 200);
	const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 25, 1), 50);
	if (!q) return reply(400, { error: "Missing q" });

	const keys = listKeys(process.env.YT_KEYS);
	if (!keys.length) return reply(500, { error: "No API keys configured" });

	const start = Math.floor(Math.random() * keys.length);
	let lastStatus = 502;

	for (let i = 0; i < keys.length; i++) {
		const key = keys[(start + i) % keys.length];
		const url =
			"https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10" +
			"&maxResults=" + limit +
			"&q=" + encodeURIComponent(q) +
			"&key=" + encodeURIComponent(key);

		try {
			const yt = await fetch(url);
			if (yt.ok) {
				const data = await yt.json();
				res.setHeader(
					"Cache-Control",
					reply.binary ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400"
				);
				return reply(200, data);
			}
			lastStatus = yt.status;
			if (yt.status !== 403 && yt.status !== 400) break;
		} catch {
			lastStatus = 502;
		}
	}

	return reply(503, { error: " exhausted or unavailable", status: lastStatus });
}

class ImportError extends Error {}

async function resolveShortLink(rawUrl) {
	let url = rawUrl;
	for (let hop = 0; hop < 5; hop++) {
		const u = new URL(url);
		if (u.protocol !== "https:" || !IMPORT_HOSTS.test(u.hostname)) {
			throw new ImportError("That link isn't supported.");
		}
		if (!SHORT_LINK_HOSTS.test(u.hostname)) return u;
		const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
		const loc = r.headers.get("location");
		if (!loc) return u;
		url = new URL(loc, url).toString();
	}
	throw new ImportError("Too many redirects.");
}

async function ytApi(path, params) {
	const keys = listKeys(process.env.YT_KEYS);
	if (!keys.length) throw new ImportError("No configuration set on this domain");
	const start = Math.floor(Math.random() * keys.length);
	let lastMsg = "YouTube request failed";
	for (let i = 0; i < keys.length; i++) {
		const key = keys[(start + i) % keys.length];
		const qs = new URLSearchParams({ ...params, key }).toString();
		try {
			const r = await fetch("https://www.googleapis.com/youtube/v3/" + path + "?" + qs);
			const d = await r.json();
			if (r.ok) return d;
			lastMsg = (d && d.error && d.error.message) || lastMsg;
			if (r.status === 404) throw new ImportError("Playlist not found (is it public?).");
			if (r.status !== 403 && r.status !== 400) break;
		} catch (err) {
			if (err instanceof ImportError) throw err;
		}
	}
	throw new ImportError(lastMsg);
}

async function importYouTube(u) {
	const list = u.searchParams.get("list");
	if (!list) throw new ImportError("No playlist ID in that YouTube link.");
	if (/^RD/.test(list)) {
		throw new ImportError("Use a regular playlist. omg an actual dumbass");
	}

	let name = "";
	try {
		const meta = await ytApi("playlists", { part: "snippet", id: list });
		name = meta.items && meta.items[0] && meta.items[0].snippet && meta.items[0].snippet.title;
	} catch (err) {
		if (!(err instanceof ImportError)) throw err;
	}

	const tracks = [];
	let page = "";
	do {
		const params = { part: "snippet,contentDetails", maxResults: "50", playlistId: list };
		if (page) params.pageToken = page;
		const d = await ytApi("playlistItems", params);
		for (const it of d.items || []) {
			const s = it.snippet;
			if (!s || s.title === "Deleted video" || s.title === "Private video") continue;
			const vid = (it.contentDetails && it.contentDetails.videoId) || (s.resourceId && s.resourceId.videoId);
			if (!vid) continue;
			const th = s.thumbnails && (s.thumbnails.high || s.thumbnails.medium || s.thumbnails.default);
			tracks.push({
				videoId: vid,
				title: s.title,
				artist: (s.videoOwnerChannelTitle || s.channelTitle || "").replace(/\s*-\s*Topic$/, ""),
				artwork: th ? th.url : "",
			});
		}
		page = d.nextPageToken || "";
	} while (page && tracks.length < IMPORT_MAX_TRACKS);

	return { name: name || "Imported from YouTube", tracks: tracks.slice(0, IMPORT_MAX_TRACKS) };
}

async function importSpotify(u) {
	const m = u.pathname.match(/(playlist|album)\/([A-Za-z0-9]+)/);
	if (!m) throw new ImportError("Couldn't read that Spotify link.");
	const r = await fetch("https://open.spotify.com/embed/" + m[1] + "/" + m[2], {
		headers: { "User-Agent": "Mozilla/5.0" },
	});
	if (!r.ok) throw new ImportError("Spotify couldn't find that " + m[1] + " (is it public?).");
	const html = await r.text();
	const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
	if (!json) throw new ImportError("Spotify blocked the import.");
	let entity;
	try {
		entity = JSON.parse(json[1]).props.pageProps.state.data.entity;
	} catch {
		throw new ImportError("Spotify changed their page format. Import is unavailable right now.");
	}
	const sources = (entity.coverArt && entity.coverArt.sources) || [];
	const art = sources.length ? sources[sources.length - 1].url : "";
	return {
		name: entity.name || entity.title || "Imported from Spotify",
		tracks: (entity.trackList || []).slice(0, IMPORT_MAX_TRACKS).map((x) => ({
			title: x.title,
			artist: x.subtitle,
			artwork: art,
		})),
	};
}

async function importPlaylist(rawUrl, reply, res) {
	const input = String(rawUrl || "").trim().slice(0, 500);
	let u;
	try {
		u = await resolveShortLink(input);
	} catch (err) {
		if (err instanceof ImportError) return reply(400, { error: err.message });
		return reply(400, { error: "That doesn't look like a valid link." });
	}

	try {
		let out;
		const host = u.hostname;
		if (/youtube\.com$|youtu\.be$/i.test(host)) out = await importYouTube(u);
		else if (/spotify\.com$/i.test(host)) out = await importSpotify(u);
		else return reply(400, { error: "That link isn't supported." });

		out.tracks = (out.tracks || []).filter((t) => t && t.title);
		res.setHeader("Cache-Control", "no-store");
		return reply(200, out);
	} catch (err) {
		if (err instanceof ImportError) return reply(502, { error: err.message });
		return reply(502, { error: "Import failed. Try again later." });
	}
}


class UpstreamError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

function toTurns(body) {
	if (!Array.isArray(body.messages) && !Array.isArray(body.contents) && typeof body.message === "string") {
		return [{ role: "user", text: body.message.trim() }];
	}
	if (Array.isArray(body.messages)) {
		return body.messages
			.filter((m) => m && typeof m.content === "string")
			.map((m) => ({ role: m.role === "assistant" || m.role === "model" ? "assistant" : "user", text: m.content }));
	}
	return (body.contents || []).map((c) => ({
		role: c && c.role === "model" ? "assistant" : "user",
		text: ((c && c.parts) || []).map((p) => (p && p.text) || "").join(""),
	}));
}

async function upstream(url, headers, payload) {
	const r = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(payload),
	});
	let data = null;
	try {
		data = await r.json();
	} catch {}
	if (!r.ok) {
		const msg = (data && ((data.error && (data.error.message || data.error)) || data.message)) || "Request failed";
		throw new UpstreamError(r.status, typeof msg === "string" ? msg : JSON.stringify(msg));
	}
	return data;
}

const geminiShape = (text) => ({
	candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }],
});

const CALLERS = {
	async gemini(key, model, turns, cfg, body) {
		const contents = Array.isArray(body.contents)
			? body.contents
			: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] }));
		const payload = {
			contents,
			generationConfig: { temperature: cfg.temperature, maxOutputTokens: cfg.maxTokens },
		};
		if (body.system) payload.systemInstruction = { parts: [{ text: String(body.system) }] };
		return upstream(
			"https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
			{ "x-goog-api-key": key },
			payload
		);
	},

	async deepseek(key, model, turns, cfg, body) {
		const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
		const messages = turns.map((t) => ({ role: t.role, content: t.text }));
		if (body.system) messages.unshift({ role: "system", content: String(body.system) });
		const d = await upstream(base + "/chat/completions", { Authorization: "Bearer " + key }, {
			model,
			messages,
			temperature: cfg.temperature,
			max_tokens: cfg.maxTokens,
			stream: false,
		});
		return geminiShape((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "");
	},

	async claude(key, model, turns, cfg, body) {
		const base = (process.env.CLAUDE_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
		const payload = {
			model,
			max_tokens: cfg.maxTokens,
			temperature: Math.min(cfg.temperature, 1),
			messages: turns.map((t) => ({ role: t.role, content: t.text })),
		};
		if (body.system) payload.system = String(body.system);
		const d = await upstream(base + "/v1/messages", { "x-api-key": key, "anthropic-version": "2023-06-01" }, payload);
		return geminiShape((d.content || []).map((c) => (c.type === "text" ? c.text : "")).join(""));
	},

	async ollama(key, model, turns, cfg, body) {
		const base = (process.env.OLLAMA_BASE_URL || "https://ollama.com").replace(/\/$/, "");
		const messages = turns.map((t) => ({ role: t.role, content: t.text }));
		if (body.system) messages.unshift({ role: "system", content: String(body.system) });
		const d = await upstream(base + "/api/chat", { Authorization: "Bearer " + key }, {
			model,
			messages,
			stream: false,
			options: { temperature: cfg.temperature, num_predict: cfg.maxTokens },
		});
		return geminiShape((d.message && d.message.content) || "");
	},
};

async function chat(body, reply, res) {
	if (!body || typeof body !== "object") return reply(400, { error: { message: "Invalid body" } });

	let provider = body.provider;
	let model = body.model;
	if (!provider && model) {
		provider = Object.keys(PROVIDERS).find((p) => PROVIDERS[p].models.includes(model));
	}
	if (!provider) {
		provider = Object.keys(PROVIDERS).find((p) => listKeys(process.env[PROVIDERS[p].keys]).length) || "gemini";
	}
	const cfgP = PROVIDERS[provider];
	if (!cfgP) return reply(400, { error: { message: "Unsupported provider dummy" } });
	if (!model) model = cfgP.models[0];
	if (!cfgP.models.includes(model)) return reply(400, { error: { message: "Unsupported model dummy" } });
	body.model = model;

	const keys = listKeys(process.env[cfgP.keys]);
	if (!keys.length) return reply(500, { error: { message: "No worky so  it no fixy " + provider } });

	const source = Array.isArray(body.messages)
		? body.messages
		: Array.isArray(body.contents)
			? body.contents
			: typeof body.message === "string" && body.message.trim()
				? [body.message]
				: null;
	if (!Array.isArray(source) || !source.length || source.length > MAX_TURNS) {
		return reply(400, { error: { message: "Invalid messages" } });
	}
	if (JSON.stringify(source).length > MAX_CONTENT_CHARS) {
		return reply(413, { error: { message: "Request too large" } });
	}

	const gc = body.generationConfig || {};
	const cfg = {
		temperature: clamp(body.temperature ?? gc.temperature, 0.7, 0, 2),
		maxTokens: Math.round(clamp(body.max_tokens ?? gc.maxOutputTokens, 1024, 1, 8192)),
	};
	const turns = toTurns(body);
	if (!turns.length) return reply(400, { error: { message: "Invalid messages" } });

	const start = Math.floor(Math.random() * keys.length);
	let lastStatus = 502;
	for (let i = 0; i < keys.length; i++) {
		const key = keys[(start + i) % keys.length];
		try {
			const data = await CALLERS[provider](key, body.model, turns, cfg, body);
			res.setHeader("Cache-Control", "no-store");
			return reply(200, data);
		} catch (err) {
			if (err instanceof UpstreamError) {
				lastStatus = err.status;
				if (RETRY_STATUSES.includes(err.status)) continue;
				return reply(err.status, { error: { message: err.message, status: err.status } });
			}
			lastStatus = 502;
		}
	}
	return reply(503, { error: { message: "not allowed dum dum", status: lastStatus } });
}

function listModels(reply, res) {
	const providers = Object.keys(PROVIDERS)
		.filter((p) => listKeys(process.env[PROVIDERS[p].keys]).length)
		.map((p) => ({ provider: p, models: PROVIDERS[p].models }));
	res.setHeader("Cache-Control", "no-store");
	return reply(200, { providers });
}


export default async function handler(req, res) {
	res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
	res.setHeader("Vary", "Origin");
	if (req.method === "OPTIONS") return res.status(204).end();

	if (req.method === "GET") {
		if (req.query.models !== undefined) return listModels(makeReply(res, false), res);
		return youtubeSearch(req.query.q, req.query.limit, makeReply(res, false), res);
	}

	if (req.method === "POST") {
		const binary = String(req.headers["content-type"] || "").includes("octet-stream");
		const reply = makeReply(res, binary);

		let body = req.body;
		if (binary) {
			const raw = await readRaw(req);
			if (!raw) return reply(400, { error: { message: "Invalid body" } });
			try {
				body = JSON.parse(obf(raw).toString("utf8"));
			} catch {
				return reply(400, { error: { message: "Invalid body" } });
			}
		} else if (typeof body === "string") {
			try {
				body = JSON.parse(body);
			} catch {
				body = null;
			}
		}

		if (body && body.type === "models") return listModels(reply, res);
		if (body && body.type === "youtube") return youtubeSearch(body.q, body.limit, reply, res);
		if (body && body.type === "playlist") return importPlaylist(body.url, reply, res);
		return chat(body, reply, res);
	}

	res.setHeader("Allow", "GET, POST");
	return res.status(405).json({ error: { message: "not allowed dum dum" } });
}
