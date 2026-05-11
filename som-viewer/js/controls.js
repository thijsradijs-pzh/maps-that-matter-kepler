// js/controls.js

function setupControls() {
  // Mode tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.mode;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${mode}`).classList.add('active');
      document.getElementById('controls').classList.remove('collapsed');
      render();
    });
  });

  // Year slider
  const slider = document.getElementById('year-slider');
  const display = document.getElementById('year-display');
  slider.addEventListener('input', () => {
    activeYear = parseInt(slider.value);
    display.textContent = activeYear;
    render();
  });

  // Play button — start from 2018, stop at 2023
  const playBtn = document.getElementById('play-btn');
  playBtn.addEventListener('click', () => {
    if (playInterval) {
      clearInterval(playInterval); playInterval = null;
      playBtn.textContent = '▶ Afspelen';
    } else {
      if (activeYear >= 2023) {
        activeYear = 2018;
        slider.value = activeYear; display.textContent = activeYear;
        render();
      }
      playBtn.textContent = '⏸ Pauzeren';
      playInterval = setInterval(() => {
        if (activeYear >= 2023) {
          clearInterval(playInterval); playInterval = null;
          playBtn.textContent = '▶ Afspelen';
          return;
        }
        activeYear++;
        slider.value = activeYear; display.textContent = activeYear;
        render();
      }, 900);
    }
  });

  // Scenario buttons
  document.querySelectorAll('#panel-scenario .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#panel-scenario .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeScenarioCol = btn.dataset.col;
      render();
    });
  });

  // Trend buttons
  document.querySelectorAll('#panel-trend .option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#panel-trend .option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTrendCol = btn.dataset.col;
      render();
    });
  });

  document.getElementById('changed-only').addEventListener('change', e => { changedOnly = e.target.checked; render(); });
  document.getElementById('trend-changed-only').addEventListener('change', e => { trendChangedOnly = e.target.checked; render(); });

  document.getElementById('controls-collapse').addEventListener('click', () => {
    document.getElementById('controls').classList.toggle('collapsed');
  });

  document.getElementById('controls-info-btn').addEventListener('click', reopenStory);

  const infoToggle = document.getElementById('info-toggle');
  const infoBody = document.getElementById('info-body');
  infoToggle.addEventListener('click', () => {
    infoToggle.classList.toggle('open');
    infoBody.classList.toggle('open');
  });

  document.getElementById('fullscreen-btn').addEventListener('click', () => {
    if (!document.fullscreenElement) document.getElementById('container').requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  document.getElementById('traj-close').addEventListener('click', hideTrajectory);
}
