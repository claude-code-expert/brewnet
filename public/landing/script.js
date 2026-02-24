// Brewnet Landing Page — Interactive Script

(function () {
  'use strict';

  // ─── Navigation scroll effect ───
  var nav = document.getElementById('nav');
  window.addEventListener('scroll', function () {
    if (window.scrollY > 20) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  });

  // ─── Mobile nav toggle ───
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });
    // Close on link click
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('open');
      });
    });
  }

  // ─── Terminal typewriter animation ───
  var commands = [
    {
      cmd: 'npx brewnet init',
      output: [
        '<span class="out-green">&#10003;</span> <span class="out-bold">System Check</span> <span class="out-muted">— OS: Linux, Docker: v24.0, Ports: Available</span>',
        '<span class="out-green">&#10003;</span> <span class="out-bold">Project Setup</span> <span class="out-muted">— Name: my-server, Path: ~/brewnet-server</span>',
        '<span class="out-green">&#10003;</span> <span class="out-bold">Server Components</span> <span class="out-muted">— Traefik, PostgreSQL, Nextcloud, Gitea</span>',
        '<span class="out-green">&#10003;</span> <span class="out-bold">Domain</span> <span class="out-muted">— my-server.dpdns.org + Cloudflare Tunnel</span>',
        '<span class="out-green">&#10003;</span> <span class="out-bold">Docker Compose</span> <span class="out-muted">— Generated &amp; services started</span>',
        '',
        '<span class="out-cyan">&#9670;</span> <span class="out-bold">Server is ready!</span>',
        '  Dashboard  <span class="out-cyan">https://my-server.dpdns.org</span>',
        '  Nextcloud  <span class="out-cyan">https://files.my-server.dpdns.org</span>',
        '  Gitea      <span class="out-cyan">https://git.my-server.dpdns.org</span>',
      ]
    },
    {
      cmd: 'brewnet status',
      output: [
        '<span class="out-bold">SERVICE        STATUS      PORT    URL</span>',
        '<span class="out-green">traefik</span>        <span class="out-green">running</span>     80/443  <span class="out-cyan">my-server.dpdns.org</span>',
        '<span class="out-green">postgresql</span>     <span class="out-green">running</span>     5432    <span class="out-muted">internal</span>',
        '<span class="out-green">nextcloud</span>      <span class="out-green">running</span>     8080    <span class="out-cyan">files.my-server.dpdns.org</span>',
        '<span class="out-green">gitea</span>          <span class="out-green">running</span>     3000    <span class="out-cyan">git.my-server.dpdns.org</span>',
        '<span class="out-green">redis</span>          <span class="out-green">running</span>     6379    <span class="out-muted">internal</span>',
        '',
        '<span class="out-muted">5 services running | Uptime: 3d 12h | Tunnel: active</span>',
      ]
    },
    {
      cmd: 'brewnet add jellyfin',
      output: [
        '<span class="out-cyan">&#9654;</span> Pulling jellyfin/jellyfin:latest...',
        '<span class="out-green">&#10003;</span> Image pulled successfully',
        '<span class="out-cyan">&#9654;</span> Updating docker-compose.yml...',
        '<span class="out-green">&#10003;</span> Service added: <span class="out-bold">jellyfin</span>',
        '<span class="out-cyan">&#9654;</span> Configuring reverse proxy...',
        '<span class="out-green">&#10003;</span> Route: <span class="out-cyan">https://media.my-server.dpdns.org</span>',
        '',
        '<span class="out-green">&#10003;</span> <span class="out-bold">Jellyfin is ready!</span> <span class="out-muted">Open the URL above to get started.</span>',
      ]
    }
  ];

  var typewriterEl = document.getElementById('typewriter');
  var outputEl = document.getElementById('termOutput');
  var cursorEl = document.querySelector('.term-cursor');
  var currentCmd = 0;

  function typeCommand(text, callback) {
    var i = 0;
    typewriterEl.textContent = '';
    if (cursorEl) cursorEl.style.display = 'inline';

    function typeChar() {
      if (i < text.length) {
        typewriterEl.textContent += text[i];
        i++;
        setTimeout(typeChar, 40 + Math.random() * 40);
      } else {
        if (cursorEl) cursorEl.style.display = 'none';
        if (callback) setTimeout(callback, 300);
      }
    }
    typeChar();
  }

  function showOutput(lines, callback) {
    outputEl.innerHTML = '';
    var i = 0;
    function showLine() {
      if (i < lines.length) {
        var div = document.createElement('div');
        div.innerHTML = lines[i];
        div.style.opacity = '0';
        div.style.transform = 'translateY(4px)';
        div.style.transition = 'opacity 0.25s, transform 0.25s';
        outputEl.appendChild(div);
        // Trigger animation
        requestAnimationFrame(function () {
          div.style.opacity = '1';
          div.style.transform = 'translateY(0)';
        });
        i++;
        setTimeout(showLine, 80);
      } else {
        if (callback) setTimeout(callback, 3000);
      }
    }
    showLine();
  }

  function runSequence() {
    var cmd = commands[currentCmd];
    typeCommand(cmd.cmd, function () {
      showOutput(cmd.output, function () {
        currentCmd = (currentCmd + 1) % commands.length;
        runSequence();
      });
    });
  }

  // Start after a brief delay
  setTimeout(runSequence, 800);

  // ─── Smooth scroll for anchor links ───
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
})();

// ─── Copy code to clipboard ───
function copyCode(btn) {
  var code = btn.parentElement.querySelector('code');
  if (code) {
    navigator.clipboard.writeText(code.textContent).then(function () {
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(function () {
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
      }, 2000);
    });
  }
}
