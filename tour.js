/* ==========================================================================
   첫 방문 단계별 안내

   폼의 각 단계를 스포트라이트로 짚어가며 설명합니다. index.html 전용입니다
   (다른 페이지엔 폼이 없습니다).

   한 번 끝내거나 건너뛰면 localStorage 에 기록하고 다시 뜨지 않습니다.
   다시 보려면 "사용 팁" 안의 버튼(startTour) 또는 주소에 ?tour=1.

   좌표는 뷰포트가 아니라 **문서** 기준(pageX/pageY)으로 잡습니다. 그래야
   스크롤할 때 구멍이 대상을 따라다니느라 스크롤 이벤트를 붙들 필요가 없습니다.
   ========================================================================== */
(function () {
    'use strict';

    var KEY = 'fin-tour-done';
    var PAD = 8;      // 구멍이 대상보다 얼마나 넉넉한지
    var GAP = 12;     // 구멍과 말풍선 사이

    var STEPS = [
        {
            sel: '#sym-ab-grid',
            title: '먼저 비교할 종목을 넣습니다',
            body: '미국 티커(SPY, AAPL)나 한글 종목명(삼성전자)을 입력하면 자동으로 찾아줍니다. ' +
                  '아래 버튼으로 종목을 하나 더 추가해 셋까지 비교할 수 있습니다.'
        },
        {
            sel: '#step-type',
            title: '투자 방식을 고릅니다',
            body: '적립식은 매달 같은 금액을 나눠 넣는 방식, 일괄투자는 시작일에 한 번에 넣는 방식입니다.'
        },
        {
            sel: '.amount-row',
            title: '금액을 정합니다',
            body: '적립식이면 매달 넣을 금액, 일괄투자면 처음에 한 번 넣을 금액입니다.'
        },
        {
            sel: '#step-period',
            title: '기간을 정합니다',
            body: '버튼으로 고르거나, 바로 아래 "날짜 직접 선택"에서 시작일과 종료일을 직접 지정할 수 있습니다.'
        },
        {
            sel: '#run-btn',
            title: '누르면 끝입니다',
            body: '실제 종가로 계산해 수익률·최종 평가금·CAGR을 보여줍니다. ' +
                  '결과가 나온 뒤의 주소는 그대로 공유할 수 있는 링크입니다.'
        }
    ];

    var idx = 0, hole = null, pop = null, onResize = null;

    function done() {
        try { localStorage.setItem(KEY, '1'); } catch (e) { /* 저장만 못 할 뿐입니다 */ }
    }

    function close() {
        if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
        document.removeEventListener('keydown', onKey);
        if (hole) { hole.remove(); hole = null; }
        if (pop) { pop.remove(); pop = null; }
    }

    function onKey(e) {
        if (e.key === 'Escape') { done(); close(); }
        else if (e.key === 'ArrowRight') next();
        else if (e.key === 'ArrowLeft') prev();
    }

    function next() { if (idx < STEPS.length - 1) { idx++; show(); } else { done(); close(); } }
    function prev() { if (idx > 0) { idx--; show(); } }

    function place() {
        var el = document.querySelector(STEPS[idx].sel);
        if (!el) return;
        var r = el.getBoundingClientRect();
        var top = r.top + window.scrollY, left = r.left + window.scrollX;

        hole.style.top = (top - PAD) + 'px';
        hole.style.left = (left - PAD) + 'px';
        hole.style.width = (r.width + PAD * 2) + 'px';
        hole.style.height = (r.height + PAD * 2) + 'px';

        // 아래에 자리가 없으면 위로 — 말풍선이 화면 밖으로 나가지 않게
        var below = window.innerHeight - r.bottom;
        var above = r.top;
        var popH = pop.offsetHeight;
        pop.style.top = (below >= popH + GAP + PAD || below >= above)
            ? (top + r.height + PAD + GAP) + 'px'
            : (top - PAD - GAP - popH) + 'px';

        // 가로는 대상 왼쪽에 맞추되 화면 안으로 밀어 넣습니다
        var maxLeft = window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 16;
        pop.style.left = Math.max(window.scrollX + 16, Math.min(left - PAD, maxLeft)) + 'px';
    }

    function show() {
        var step = STEPS[idx];
        var el = document.querySelector(step.sel);
        if (!el) { next(); return; }

        pop.innerHTML =
            '<div class="tour-count"></div>' +
            '<div class="tour-title"></div>' +
            '<div class="tour-body"></div>' +
            '<div class="tour-actions">' +
              '<button type="button" class="tour-skip">건너뛰기</button>' +
              '<button type="button" class="tour-prev">이전</button>' +
              '<button type="button" class="tour-next"></button>' +
            '</div>';
        pop.querySelector('.tour-count').textContent = (idx + 1) + ' / ' + STEPS.length;
        pop.querySelector('.tour-title').textContent = step.title;
        pop.querySelector('.tour-body').textContent = step.body;

        var prevBtn = pop.querySelector('.tour-prev');
        prevBtn.hidden = idx === 0;
        prevBtn.addEventListener('click', prev);

        var nextBtn = pop.querySelector('.tour-next');
        nextBtn.textContent = idx === STEPS.length - 1 ? '완료' : '다음';
        nextBtn.addEventListener('click', next);

        pop.querySelector('.tour-skip').addEventListener('click', function () { done(); close(); });

        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        place();
        nextBtn.focus({ preventScroll: true });
    }

    function start() {
        if (hole) return;                         // 이미 떠 있으면 다시 열지 않습니다
        if (!document.querySelector(STEPS[0].sel)) return;
        idx = 0;

        hole = document.createElement('div');
        hole.className = 'tour-hole';

        pop = document.createElement('div');
        pop.className = 'tour-pop';
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', '사용 안내');

        document.body.appendChild(hole);
        document.body.appendChild(pop);

        onResize = place;
        window.addEventListener('resize', onResize);
        document.addEventListener('keydown', onKey);
        show();
    }

    // "사용 팁" 안의 버튼이 부릅니다
    window.startTour = function () {
        // 팁 팝오버가 열린 채면 닫습니다 — 클래스는 .open 입니다(toggleTip 참고)
        document.querySelectorAll('.tip-popup.open').forEach(function (p) {
            p.classList.remove('open');
        });
        start();
    };

    function firstVisit() {
        if (new URLSearchParams(location.search).get('tour') === '1') return true;
        try { return !localStorage.getItem(KEY); } catch (e) { return false; }
    }

    if (firstVisit()) {
        // 자동 실행은 첫 계산이 그려진 뒤로 미룹니다 — 빈 화면을 설명하지 않도록
        window.addEventListener('load', function () { setTimeout(start, 600); });
    }
})();
