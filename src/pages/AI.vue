<script setup lang="ts">
import { Send } from '@lucide/vue';
import { nextTick, onMounted, ref } from 'vue';

const API_URL = '/api/worker';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type ProviderModels = { provider: string; models: string[] };

const message = ref('');
const loading = ref(false);
const error = ref('');
const history = ref<ChatMessage[]>([]);
const providers = ref<ProviderModels[]>([]);
const selected = ref(''); 
const messagesEl = ref<HTMLElement | null>(null);

onMounted(async () => {
  try {
    const res = await fetch(API_URL + '?models');
    const data = await res.json();
    providers.value = data.providers || [];
    const first = providers.value[0];
    if (first && first.models.length) selected.value = first.provider + '|' + first.models[0];
  } catch (e) {
    error.value = 'Could not load models.';
  }
});

async function scrollDown() {
  await nextTick();
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
}

async function send() {
  const text = message.value.trim();
  if (!text || loading.value || !selected.value) return;

  const [provider, model] = selected.value.split('|');
  error.value = '';
  history.value.push({ role: 'user', content: text });
  message.value = '';
  loading.value = true;
  scrollDown();

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        model,
        messages: history.value.slice(-30),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data && data.error && data.error.message) || 'Request failed');
    const reply =
      data && data.candidates && data.candidates[0] && data.candidates[0].content
        ? data.candidates[0].content.parts.map((p: { text?: string }) => p.text || '').join('')
        : '';
    history.value.push({ role: 'assistant', content: reply || '(empty response)' });
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Something went wrong.';
  } finally {
    loading.value = false;
    scrollDown();
  }
}
</script>

<template>
  <div class="aiPage">
    <div v-if="history.length || error" class="aiMessages" ref="messagesEl">
      <div
        v-for="(m, i) in history"
        :key="i"
        class="aiMsg"
        :class="m.role === 'user' ? 'aiMsgUser' : 'aiMsgBot'"
      >{{ m.content }}</div>
      <div v-if="loading" class="aiMsg aiMsgBot">...</div>
      <div v-if="error" class="aiError">{{ error }}</div>
    </div>

    <div class="aiInputArea" id="aiInputArea">
      <select
        v-model="selected"
        class="aiModelSelect"
        id="aiModel"
        name="model"
        aria-label="Choose model"
        :disabled="!providers.length"
      >
        <option v-if="!providers.length" value="" disabled>No models</option>
        <optgroup v-for="p in providers" :key="p.provider" :label="p.provider">
          <option v-for="m in p.models" :key="m" :value="p.provider + '|' + m">{{ m }}</option>
        </optgroup>
      </select>
      <input
        v-model="message"
        class="aiInput"
        id="aiMessage"
        name="message"
        type="text"
        placeholder="Type Here..."
        required
        @keydown.enter="send"
      >
      <button
        class="sendBtn"
        id="aiSendButton"
        type="button"
        aria-label="Send message"
        :disabled="loading || !selected"
        @click="send"
      >
        <Send class="sendIcon" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.aiPage {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 0;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.aiInputArea {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 0 clamp(14px, 3vw, 32px) 20px;
  animation: fadeIn 200ms ease-out 200ms both;
}

.aiInput {
  flex: 1;
  min-width: 0;
  resize: none;
  padding: 12px 16px;
  border: 2px solid var(--sg-border);
  border-radius: 6px;
  background: var(--sg-surface);
  color: var(--sg-text);
  font-size: 1rem;
  font-family: inherit;
  height: 50px;
  max-height: 50px;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  line-height: 26px;
}

.aiInput::placeholder {
  color: var(--sg-text-muted);
  opacity: 1;
}

.aiInput:focus {
  outline: none;
}

.sendBtn {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  padding: 0;
  box-sizing: border-box;
  border: 2px solid var(--sg-border);
  border-radius: 6px;
  background: var(--sg-surface);
  color: var(--sg-accent-soft);
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.sendBtn .sendIcon {
  color: var(--sg-text-muted);
}

.sendBtn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (max-width: 600px) {
  .aiInputArea {
    gap: 8px;
    padding: 0 10px 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .aiInputArea {
    animation: none;
  }
}

.aiModelSelect {
  flex-shrink: 0;
  max-width: 160px;
  height: 50px;
  padding: 0 10px;
  box-sizing: border-box;
  border: 2px solid var(--sg-border);
  border-radius: 6px;
  background: var(--sg-surface);
  color: var(--sg-text);
  font-size: 1rem;
  font-family: inherit;
  cursor: pointer;
}

.aiModelSelect:focus {
  outline: none;
}

.aiMessages {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 0 clamp(14px, 3vw, 32px) 14px;
}

.aiMsg {
  max-width: 85%;
  padding: 10px 14px;
  border: 2px solid var(--sg-border);
  border-radius: 6px;
  background: var(--sg-surface);
  color: var(--sg-text);
  font-size: 1rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.aiMsgUser {
  align-self: flex-end;
}

.aiMsgBot {
  align-self: flex-start;
}

.aiError {
  color: var(--sg-text-muted);
  font-size: 0.9rem;
}

@media (max-width: 600px) {
  .aiModelSelect {
    max-width: 110px;
    padding: 0 6px;
  }

  .aiMessages {
    padding: 0 10px 10px;
  }
}
</style>
