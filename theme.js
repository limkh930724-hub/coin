/* ==========================================================================
   테마 모드 — 기본 / 리소

   style.css 의 [data-theme="..."] 블록과 짝입니다. 바꾸는 것은 색·서체·
   테두리·그림자·아이콘 그리기 방식이고, 레이아웃은 두 모드가 같습니다.

   모든 페이지가 <head> 에서 style.css 직전에 **동기로** 불러옵니다.
   defer 를 붙이면 기본 테마가 한 번 그려졌다가 바뀌면서 깜빡입니다.

   서체는 활성 테마의 것만 jsDelivr(@fontsource)에서 불러옵니다 —
   기본 테마는 추가 요청이 없습니다.
   ========================================================================== */
(function () {
    'use strict';

    var KEY = 'fin-theme';
    var CDN = 'https://cdn.jsdelivr.net/npm/@fontsource/';

    var THEMES = {
        base:     { label: '기본',   desc: '밝고 단정하게',    bar: '#FFFFFF', fonts: [] },
        riso:     { label: '리소',   desc: '종이에 인쇄한 듯', bar: '#16150F',
                    fonts: ['black-han-sans@5/index.css'] }
    };
    var ORDER = ['base', 'riso'];

    var ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
        ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>';

    function saved() {
        try {
            var t = localStorage.getItem(KEY);
            return THEMES[t] ? t : 'base';
        } catch (e) { return 'base'; }   // 시크릿 모드 등에서 localStorage 가 막힌 경우
    }

    var current = saved();
    var fontsLoaded = {};

    function loadFonts(name) {
        THEMES[name].fonts.forEach(function (f) {
            if (fontsLoaded[f]) return;
            fontsLoaded[f] = true;
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = CDN + f;
            document.head.appendChild(link);
        });
    }

    function apply(name) {
        current = name;
        document.documentElement.setAttribute('data-theme', name);
        loadFonts(name);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', THEMES[name].bar);
    }

    apply(current);   // 첫 페인트 전에 적용 — 여기가 이 파일이 동기여야 하는 이유입니다

    // ── 전환기 UI ─────────────────────────────────────────────────────────
    function build() {
        var nav = document.querySelector('.topnav');
        if (!nav) return;

        var wrap = document.createElement('div');
        wrap.className = 'theme-switch';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-btn';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', '화면 테마 선택');
        btn.innerHTML = ICON + '<span class="theme-btn-label"></span>';
        var label = btn.querySelector('.theme-btn-label');

        var menu = document.createElement('div');
        menu.className = 'theme-menu';
        menu.setAttribute('role', 'menu');

        var items = ORDER.map(function (name) {
            var item = document.createElement('button');
            item.type = 'button';
            item.setAttribute('role', 'menuitemradio');
            item.dataset.theme = name;
            item.innerHTML = '<span></span><span class="theme-menu-desc"></span>';
            item.children[0].textContent = THEMES[name].label;
            item.children[1].textContent = THEMES[name].desc;
            item.addEventListener('click', function () { choose(name); });
            menu.appendChild(item);
            return item;
        });

        function sync() {
            label.textContent = THEMES[current].label;
            items.forEach(function (item) {
                item.setAttribute('aria-checked', String(item.dataset.theme === current));
            });
        }

        function open(yes) {
            menu.classList.toggle('show', yes);
            btn.setAttribute('aria-expanded', String(yes));
        }

        function choose(name) {
            apply(name);
            try { localStorage.setItem(KEY, name); } catch (e) { /* 저장만 못 할 뿐 적용은 됩니다 */ }
            sync();
            open(false);
            // 차트 색은 JS 안에 들어가 있어서 다시 칠해야 합니다 (index.html 이 받습니다)
            window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: name } }));
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            open(!menu.classList.contains('show'));
        });
        menu.addEventListener('click', function (e) { e.stopPropagation(); });
        document.addEventListener('click', function () { open(false); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && menu.classList.contains('show')) { open(false); btn.focus(); }
        });

        wrap.appendChild(btn);
        wrap.appendChild(menu);
        nav.appendChild(wrap);
        sync();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }
})();
