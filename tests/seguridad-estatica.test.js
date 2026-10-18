import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const SCRIPTS = ['js/chat.js', 'js/chat-core.js', 'js/chat-config.js'];

describe('the widget never turns text into markup', () => {
  for (const file of ['js/chat.js', 'js/chat-core.js']) {
    it(`${file} uses no HTML-injecting API`, () => {
      const source = read(file);
      for (const forbidden of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'DOMParser']) {
        assert.ok(!source.includes(forbidden), `${file} contains ${forbidden}`);
      }
    });
  }

  it('js/chat.js writes visitor and model text with textContent', () => {
    assert.ok(read('js/chat.js').includes('textContent'));
  });
});

describe('the widget stores nothing in the browser', () => {
  for (const file of SCRIPTS) {
    it(`${file} uses no cookies or web storage`, () => {
      const source = read(file);
      for (const forbidden of ['document.cookie', 'localStorage', 'sessionStorage', 'indexedDB']) {
        assert.ok(!source.includes(forbidden), `${file} contains ${forbidden}`);
      }
    });
  }
});

describe('third-party addresses live in one file', () => {
  it('only chat-config.js names addresses', () => {
    for (const file of ['js/chat.js', 'js/chat-core.js']) {
      assert.ok(!/https?:\/\//.test(read(file)), `${file} contains an address`);
    }
  });
});

// Every page carries the chat, so every page carries the same policy: one exact line to update.
const PAGES = ['index.html', 'cv.html', 'privacidad.html', ...readdirSync(new URL('../proyectos/', import.meta.url))
  .filter((file) => file.endsWith('.html')).map((file) => `proyectos/${file}`)];
const cspOf = (path) => read(path).match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] ?? '';

describe('every page loads the chat', () => {
  for (const page of PAGES) {
    it(`${page} loads chat.js and chat.css`, () => {
      const html = read(page);
      assert.match(html, /<script type="module" src="(\.\.\/)?js\/chat\.js"><\/script>/);
      assert.match(html, /<link rel="stylesheet" href="(\.\.\/)?css\/chat\.css" \/>/);
    });
  }

  it('all pages share one Content-Security-Policy', () => {
    const policies = new Set(PAGES.map(cspOf));
    assert.equal(policies.size, 1, [...policies].join('\n'));
  });
});

describe('the Content-Security-Policy allows the chat and nothing more', () => {
  const csp = cspOf('index.html');
  const directive = (name) => csp.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? '';

  it('lets scripts come from this site and Turnstile', () => {
    assert.ok(directive('script-src').includes("'self'"));
    assert.ok(directive('script-src').includes('https://challenges.cloudflare.com'));
  });

  it('lets Turnstile and the site PDF draw their frames', () => {
    assert.equal(directive('frame-src'), "frame-src 'self' https://challenges.cloudflare.com");
  });

  it('lets the page talk to this site, the backend and Web Analytics only', () => {
    const connect = directive('connect-src');
    assert.equal(connect, "connect-src 'self' https://portfolio-chatbot.devpatuel.workers.dev https://cloudflareinsights.com");
  });

  it('lets Cloudflare Web Analytics load its beacon', () => {
    assert.ok(directive('script-src').includes('https://static.cloudflareinsights.com'));
  });

  it('keeps the rest strict', () => {
    assert.ok(directive('default-src').includes("'self'"));
    assert.equal(directive('style-src'), "style-src 'self'");
    assert.equal(directive('object-src'), "object-src 'none'");
    assert.ok(!csp.includes("'unsafe-inline'"));
    assert.ok(!csp.includes("'unsafe-eval'"));
  });
});

describe('the _headers file sends the same policy as the pages', () => {
  // The browser enforces both policies at once, so a difference would block whatever only one allows.
  const header = (name) => read('_headers').split('\n').map((line) => line.trim())
    .find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2) ?? '';

  it('the header CSP is the page CSP plus frame-ancestors (self, so cv.html can embed the PDF)', () => {
    assert.equal(header('Content-Security-Policy'), `${cspOf('index.html')} frame-ancestors 'self';`);
  });

  it('forces HTTPS and blocks MIME sniffing', () => {
    assert.match(header('Strict-Transport-Security'), /^max-age=\d+/);
    assert.equal(header('X-Content-Type-Options'), 'nosniff');
  });
});

describe('the widget does not inherit the site-wide section rules', () => {
  // css/style.css styles every `section` (max-width, big padding, borders between siblings), which
  // squeezed the chat panel; the widget must build its panel from neutral elements.
  it('js/chat.js creates no section or footer elements', () => {
    const source = read('js/chat.js');
    assert.ok(!/element\(\s*['"](section|footer)['"]/.test(source));
    assert.ok(!/createElement\(\s*['"](section|footer)['"]/.test(source));
  });
});

describe('the captcha stays out of sight', () => {
  // Turnstile's default draws its box all the time; it should only appear when a person must act.
  it('js/chat.js renders Turnstile with appearance interaction-only', () => {
    assert.ok(read('js/chat.js').includes("appearance: 'interaction-only'"));
  });
});
