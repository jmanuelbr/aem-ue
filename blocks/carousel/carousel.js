import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const SWIPE_THRESHOLD = 40;

const ICONS = {
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
};

let carouselId = 0;

function createButton(className, label, icon) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  if (icon) button.innerHTML = icon;
  return button;
}

/**
 * Reads authoring options that are applied to the block as classes.
 * @param {Element} block
 */
function getConfig(block) {
  const { classList } = block;
  const autoplayClass = [...classList].find((c) => /^autoplay-\d+$/.test(c));
  const navigation = ['nav-thumbnails', 'nav-arrows', 'nav-dots'].find((c) => classList.contains(c)) || 'nav-arrows-dots';
  return {
    loop: classList.contains('loop'),
    fade: classList.contains('transition-fade'),
    counter: classList.contains('counter'),
    autoplayDelay: autoplayClass ? Number(autoplayClass.split('-')[1]) * 1000 : 0,
    arrows: navigation !== 'nav-dots',
    dots: navigation === 'nav-arrows-dots' || navigation === 'nav-dots',
    thumbnails: navigation === 'nav-thumbnails',
  };
}

/**
 * Uses the closest heading preceding the block in its section as accessible name.
 * @param {Element} block
 */
function getCarouselLabel(block) {
  const section = block.closest('.section') || block.parentElement;
  const headings = [...(section?.querySelectorAll('h1, h2, h3, h4, h5, h6') || [])]
    .filter((h) => !block.contains(h)
      // eslint-disable-next-line no-bitwise
      && (h.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING));
  const heading = headings.pop();
  if (heading) {
    if (!heading.id) heading.id = `carousel-heading-${carouselId}`;
    return { labelledBy: heading.id };
  }
  return { label: 'Carousel' };
}

function buildSlide(row, index) {
  const slide = document.createElement('li');
  slide.className = 'carousel-slide';
  slide.dataset.slideIndex = index;
  moveInstrumentation(row, slide);

  const cells = [...row.children];
  const imageCell = cells.find((cell) => cell.querySelector('picture'));
  const otherCells = cells.filter((cell) => cell !== imageCell);
  const [contentCell, creditCell] = otherCells;

  if (imageCell) {
    imageCell.className = 'carousel-slide-image';
    imageCell.querySelectorAll('picture > img').forEach((img) => {
      const picture = createOptimizedPicture(img.src, img.alt, index === 0, [
        { media: '(min-width: 900px)', width: '1200' },
        { width: '750' },
      ]);
      moveInstrumentation(img, picture.querySelector('img'));
      img.closest('picture').replaceWith(picture);
    });
    slide.append(imageCell);
  } else {
    slide.classList.add('no-image');
  }

  if (contentCell) {
    contentCell.className = 'carousel-slide-content';
    slide.append(contentCell);
  }

  // empty credit cells are kept while authoring so they stay editable in Universal Editor
  if (creditCell && (creditCell.textContent.trim() || creditCell.hasAttribute('data-aue-prop')
    || creditCell.hasAttribute('data-richtext-prop'))) {
    creditCell.className = 'carousel-slide-credit';
    (imageCell || slide).append(creditCell);
  }

  const title = slide.querySelector('h1, h2, h3, h4, h5, h6');
  return { slide, title: title ? title.textContent.trim() : '' };
}

export default function decorate(block) {
  carouselId += 1;
  const id = `carousel-${carouselId}`;
  const config = getConfig(block);
  const isAuthoring = block.hasAttribute('data-aue-resource');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const rows = [...block.children];
  const viewport = document.createElement('div');
  viewport.className = 'carousel-viewport';
  const track = document.createElement('ul');
  track.className = 'carousel-slides';
  track.id = `${id}-slides`;

  const titles = [];
  rows.forEach((row, i) => {
    const { slide, title } = buildSlide(row, i);
    slide.id = `${id}-slide-${i + 1}`;
    track.append(slide);
    titles.push(title);
  });
  viewport.append(track);

  const slides = [...track.children];
  const count = slides.length;

  slides.forEach((slide, i) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${i + 1} of ${count}${titles[i] ? `: ${titles[i]}` : ''}`);
  });

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'carousel');
  const { label, labelledBy } = getCarouselLabel(block);
  if (labelledBy) block.setAttribute('aria-labelledby', labelledBy);
  else block.setAttribute('aria-label', label);

  block.replaceChildren(viewport);
  if (count < 2) {
    block.classList.add('single-slide');
    return;
  }

  // controls
  const controls = document.createElement('div');
  controls.className = 'carousel-controls';
  const prevButton = createButton('carousel-prev', 'Previous slide', ICONS.prev);
  const nextButton = createButton('carousel-next', 'Next slide', ICONS.next);
  prevButton.setAttribute('aria-controls', track.id);
  nextButton.setAttribute('aria-controls', track.id);

  const counter = document.createElement('p');
  counter.className = 'carousel-counter';
  counter.setAttribute('aria-hidden', 'true');

  const indicators = document.createElement('div');
  indicators.className = config.thumbnails ? 'carousel-thumbnails' : 'carousel-dots';

  let playButton;
  if (config.autoplayDelay) {
    playButton = createButton('carousel-play', 'Pause automatic slide show', ICONS.pause);
    controls.append(playButton);
  }
  if (config.arrows) controls.append(prevButton);
  if (config.dots) controls.append(indicators);
  if (config.counter) controls.append(counter);
  if (config.arrows) controls.append(nextButton);
  if (config.thumbnails) block.append(indicators);
  block.append(controls);

  let current = 0;
  let perView = 1;
  let indicatorButtons = [];

  const isFade = () => config.fade && perView === 1;
  const lastIndex = () => Math.max(0, count - perView);

  function readPerView() {
    const value = parseInt(getComputedStyle(block).getPropertyValue('--slides-per-view'), 10);
    return Number.isNaN(value) ? 1 : Math.max(1, Math.min(value, count));
  }

  function buildIndicators() {
    indicators.replaceChildren();
    const positions = config.thumbnails ? count : lastIndex() + 1;
    indicatorButtons = [];
    for (let i = 0; i < positions; i += 1) {
      const name = titles[i] ? `: ${titles[i]}` : '';
      const button = createButton(
        config.thumbnails ? 'carousel-thumbnail' : 'carousel-dot',
        `Show slide ${i + 1}${name}`,
      );
      button.setAttribute('aria-controls', track.id);
      if (config.thumbnails) {
        const img = slides[i].querySelector('.carousel-slide-image img');
        if (img) {
          const pic = createOptimizedPicture(img.currentSrc || img.src, '', false, [{ width: '160' }]);
          button.append(pic);
        } else {
          button.textContent = i + 1;
        }
      }
      button.addEventListener('click', () => {
        // eslint-disable-next-line no-use-before-define
        stopAutoplay(true);
        // eslint-disable-next-line no-use-before-define
        goTo(Math.min(i, lastIndex()));
      });
      indicators.append(button);
      indicatorButtons.push(button);
    }
  }

  function updateState() {
    const end = lastIndex();
    slides.forEach((slide, i) => {
      const visible = i >= current && i < current + perView;
      slide.classList.toggle('active', visible);
      if (!isAuthoring) slide.inert = !visible;
    });
    indicatorButtons.forEach((button, i) => {
      const active = config.thumbnails ? (i >= current && i < current + perView) : i === current;
      if (active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    if (config.thumbnails && indicatorButtons[current]) {
      const thumb = indicatorButtons[current];
      indicators.scrollTo({
        left: thumb.offsetLeft - (indicators.clientWidth - thumb.clientWidth) / 2,
        behavior: reducedMotion.matches ? 'auto' : 'smooth',
      });
    }
    prevButton.disabled = !config.loop && current === 0;
    nextButton.disabled = !config.loop && current >= end;
    const shown = perView > 1 ? `${current + 1}–${Math.min(current + perView, count)}` : current + 1;
    counter.textContent = `${shown} / ${count}`;
  }

  let scrollSyncPaused = false;
  let scrollSyncTimer;

  function goTo(target, { instant = false } = {}) {
    const end = lastIndex();
    let index = target;
    if (index < 0) index = config.loop ? end : 0;
    if (index > end) index = config.loop ? 0 : end;
    current = index;
    if (!isFade()) {
      scrollSyncPaused = true;
      clearTimeout(scrollSyncTimer);
      viewport.scrollTo({
        left: slides[index].offsetLeft - slides[0].offsetLeft,
        behavior: instant || reducedMotion.matches ? 'auto' : 'smooth',
      });
      scrollSyncTimer = setTimeout(() => { scrollSyncPaused = false; }, 700);
    }
    updateState();
  }

  // keep state in sync with native scrolling (touch swipe, trackpad, scrollbar)
  viewport.addEventListener('scroll', () => {
    if (isFade()) return;
    clearTimeout(scrollSyncTimer);
    scrollSyncTimer = setTimeout(() => {
      scrollSyncPaused = false;
      const step = slides[1].offsetLeft - slides[0].offsetLeft;
      const index = Math.min(lastIndex(), Math.max(0, Math.round(viewport.scrollLeft / step)));
      if (index !== current) {
        current = index;
        updateState();
      }
    }, scrollSyncPaused ? 700 : 120);
  }, { passive: true });

  // swipe support for the fade transition (no native scrolling there)
  let touchStartX = null;
  viewport.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });
  viewport.addEventListener('touchend', (e) => {
    if (!isFade() || touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    // eslint-disable-next-line no-use-before-define
    stopAutoplay(true);
    goTo(current + (delta < 0 ? 1 : -1));
  }, { passive: true });

  prevButton.addEventListener('click', () => {
    // eslint-disable-next-line no-use-before-define
    stopAutoplay(true);
    goTo(current - 1);
  });
  nextButton.addEventListener('click', () => {
    // eslint-disable-next-line no-use-before-define
    stopAutoplay(true);
    goTo(current + 1);
  });

  block.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const keys = {
      ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: lastIndex(),
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    // eslint-disable-next-line no-use-before-define
    stopAutoplay(true);
    goTo(keys[e.key]);
  });

  // autoplay (WCAG 2.2.2: pausable, stops on interaction, honours reduced motion)
  let autoplayTimer;
  let paused = reducedMotion.matches;
  let hovering = false;
  let focused = false;
  let onScreen = true;

  function canAutoplay() {
    return config.autoplayDelay && !isAuthoring && !paused
      && !hovering && !focused && onScreen && !document.hidden;
  }

  function updatePlayButton() {
    if (!playButton) return;
    playButton.innerHTML = paused ? ICONS.play : ICONS.pause;
    playButton.setAttribute('aria-label', paused ? 'Start automatic slide show' : 'Pause automatic slide show');
  }

  function scheduleAutoplay() {
    clearInterval(autoplayTimer);
    const running = canAutoplay();
    track.setAttribute('aria-live', running ? 'off' : 'polite');
    if (!running) return;
    autoplayTimer = setInterval(() => {
      goTo(current >= lastIndex() ? 0 : current + 1);
    }, config.autoplayDelay);
  }

  function stopAutoplay(byUser = false) {
    if (byUser && config.autoplayDelay) {
      paused = true;
      updatePlayButton();
    }
    scheduleAutoplay();
  }

  if (playButton) {
    playButton.addEventListener('click', () => {
      paused = !paused;
      updatePlayButton();
      scheduleAutoplay();
    });
    block.addEventListener('mouseenter', () => { hovering = true; scheduleAutoplay(); });
    block.addEventListener('mouseleave', () => { hovering = false; scheduleAutoplay(); });
    block.addEventListener('focusin', (e) => {
      focused = e.target !== playButton;
      scheduleAutoplay();
    });
    block.addEventListener('focusout', (e) => {
      if (!block.contains(e.relatedTarget)) {
        focused = false;
        scheduleAutoplay();
      }
    });
    document.addEventListener('visibilitychange', scheduleAutoplay);
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      scheduleAutoplay();
    }).observe(block);
  }

  // responsive slides-per-view
  function layout() {
    const next = readPerView();
    block.classList.toggle('is-fade', config.fade && next === 1);
    if (next !== perView || !indicatorButtons.length) {
      perView = next;
      if (config.dots || config.thumbnails) buildIndicators();
    }
    goTo(Math.min(current, lastIndex()), { instant: true });
  }
  new ResizeObserver(() => layout()).observe(viewport);

  // Universal Editor: reveal the slide that is selected in the editor
  if (isAuthoring) {
    document.addEventListener('aue:ui-select', (e) => {
      const { resource, selected } = e.detail || {};
      if (!selected || !resource) return;
      const el = block.querySelector(`[data-aue-resource="${resource}"]`);
      const slide = el?.closest('.carousel-slide');
      if (slide) goTo(slides.indexOf(slide));
    });
  }

  perView = readPerView();
  layout();
  updatePlayButton();
  scheduleAutoplay();
}
