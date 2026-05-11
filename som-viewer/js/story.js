// js/story.js

const TOTAL_CARDS = 5;
let currentCard = 0;

function setupStory() {
  const track  = document.getElementById('story-track');
  const dotsEl = document.getElementById('story-dots');
  const prevBtn = document.getElementById('story-prev');
  const nextBtn = document.getElementById('story-next');
  const skipBtn = document.getElementById('story-skip');

  for (let i = 0; i < TOTAL_CARDS; i++) {
    const dot = document.createElement('div');
    dot.className = 'story-dot' + (i === 0 ? ' active' : '');
    dotsEl.appendChild(dot);
  }

  function goTo(n) {
    currentCard = Math.max(0, Math.min(TOTAL_CARDS - 1, n));
    track.style.transform = `translateX(-${currentCard * 100}%)`;
    dotsEl.querySelectorAll('.story-dot').forEach((d, i) => {
      d.className = 'story-dot' + (i === currentCard ? ' active' : i < currentCard ? ' done' : '');
    });
    prevBtn.disabled = currentCard === 0;
    const isLast = currentCard === TOTAL_CARDS - 1;
    nextBtn.textContent = isLast ? 'Open kaart →' : 'Volgende →';
    nextBtn.className = 'story-btn next' + (isLast ? ' cta' : '');
    skipBtn.style.visibility = isLast ? 'hidden' : 'visible';
  }

  prevBtn.addEventListener('click', () => goTo(currentCard - 1));
  nextBtn.addEventListener('click', () => {
    if (currentCard < TOTAL_CARDS - 1) goTo(currentCard + 1);
    else closeStory();
  });
  skipBtn.addEventListener('click', closeStory);

  function onStoryKey(e) {
    if (e.key === 'Escape') { closeStory(); document.removeEventListener('keydown', onStoryKey); }
    else if (e.key === 'ArrowRight') goTo(currentCard + 1);
    else if (e.key === 'ArrowLeft')  goTo(currentCard - 1);
  }
  document.addEventListener('keydown', onStoryKey);
  window._storyCleanup = () => document.removeEventListener('keydown', onStoryKey);

  const cards = document.querySelector('.story-cards');
  let touchStartX = 0;
  cards.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  cards.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) goTo(currentCard + (dx < 0 ? 1 : -1));
  }, { passive: true });

  goTo(0);
}

function closeStory() {
  document.getElementById('story-overlay').classList.add('hidden');
  if (deckInstance) deckInstance.setProps({ controller: true });
  if (window._storyCleanup) { window._storyCleanup(); window._storyCleanup = null; }
}

function reopenStory() {
  currentCard = 0;
  document.getElementById('story-track').style.transform = 'translateX(0)';
  document.getElementById('story-dots').querySelectorAll('.story-dot').forEach((d, i) => {
    d.className = 'story-dot' + (i === 0 ? ' active' : '');
  });
  document.getElementById('story-prev').disabled = true;
  const nextBtn = document.getElementById('story-next');
  nextBtn.textContent = 'Volgende →';
  nextBtn.className = 'story-btn next';
  document.getElementById('story-skip').style.visibility = 'visible';
  document.getElementById('story-overlay').classList.remove('hidden');
  if (deckInstance) deckInstance.setProps({ controller: false });
}
