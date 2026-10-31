<script setup>
import { siDiscord } from 'simple-icons';
</script>
<template>
    <div class="homePage">
        <div class="titleArea">
            <h1 class="siteTitle">Singularity <span>V2</span></h1>
        </div>
        <form id="homepageSearchbar" class="homepageSearchbar">
            <input id="browserAddress" type="text" placeholder="Search the web..." />
        </form>
        <a
            class="discordInvite"
            href="https://discord.gg/gCVYYC9pt6"
            target="_blank"
        >
            <svg class="discordIcon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                <path :d="siDiscord.path" />
            </svg>
            <span>Discord Server</span>
        </a>
    </div>
</template>
<style scoped>
  .homePage {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
    justify-items: center;
    gap: 22px;
    flex: 1;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    text-align: center;
  }

  .discordInvite {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border: none;
    border-radius: 10px;
    background: #5865f2;
    color: #ffffff;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.2px;
    text-decoration: none;
    box-shadow: 0 6px 16px rgba(8, 16, 28, 0.28);
    animation: fadeIn 200ms ease-out 400ms both;
  }

  .discordInvite:hover {
    background: #6b77f7;
  }

  .discordInvite:focus-visible {
    outline: 2px solid var(--sg-accent-light);
    outline-offset: 2px;
  }

  .discordIcon {
    display: block;
    width: 18px;
    height: 18px;
    fill: currentColor;
    flex-shrink: 0;
  }

  .titleArea {
    display: flex;
    justify-content: center;
    width: 100%;
    animation: fadeIn 200ms ease-out both;
  }

  .siteTitle {
    margin: 0;
    color: var(--sg-accent-soft);
    font-size: clamp(2rem, 5vw, 4rem);
    font-weight: 600;
    letter-spacing: 0.15px;
    transform: translateY(-0.15em);
  }

  .siteTitle span {
    font-weight: 700;
    background-size: 200% 200%;
    background-position: 0% 0%;
    background-image: repeating-linear-gradient(
      135deg,
      var(--sg-accent-soft) 0%,
      var(--sg-accent) 25%,
      var(--sg-accent-soft) 50%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: gradientMove 6s linear infinite;
    filter: drop-shadow(0 0 12px color-mix(in srgb, var(--sg-accent) 60%, transparent));
  }

  
  @keyframes gradientMove {
    0% {
      background-position: 100% 100%;
    }
    100% {
      background-position: 0% 0%;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @keyframes searchbarAnim {
    from {
      width: 100%;
    }

    to {
      width: 106%;
    }
  }

  .homepageSearchbar {
    display: grid;
    justify-items: center;
    width: min(640px, 92%);
    animation: fadeIn 200ms ease-out 200ms both;
  }

  .homepageSearchbar input {
    box-sizing: border-box;
    width: 100%;
    height: 60px;
    padding: 0 22px;
    border: 1px solid var(--sg-border);
    border-radius: 16px;
    background: var(--sg-surface-raised);
    color: var(--sg-text);
    font-size: clamp(16px, 1.4vw, 19px);
    text-align: center;
    outline: none;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
    transition: width 220ms ease-out;
  }

  .homepageSearchbar:hover input {
    width: 106%;
    animation: searchbarAnim 200ms ease-out;
  }

  .homepageSearchbar input::placeholder {
    color: var(--sg-text-muted);
  }

  .homepageSearchbar input:focus {
    border-color: var(--sg-accent);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--sg-accent) 28%, transparent),
      0 6px 16px rgba(0, 0, 0, 0.22);
  }

  @media (prefers-reduced-motion: reduce) {
    .titleArea,
    .homepageSearchbar,
    .discordInvite,
    .siteTitle span,
    .homepageSearchbar input {
      animation: none;
    }

    .homepageSearchbar:hover input {
      width: 100%;
    }
  }
</style>