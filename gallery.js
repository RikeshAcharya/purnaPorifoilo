// gallery.js – loads images from gallery-list.json and builds a slideshow
(function () {
  const galleryContainer = document.getElementById('live-gallery-display');
  if (!galleryContainer) return;

  let slides = [];
  let currentIndex = 0;
  let autoPlayInterval = null;
  const AUTO_DELAY = 5000; // 5 seconds

  // LightGallery instance reference
  let lgInstance = null;

  // ---------- Open LightGallery ----------
  function openLightbox(index) {
    if (!slides.length) return;

    // If LightGallery is not loaded, fallback to opening in new tab
    if (typeof lightGallery === 'undefined') {
      window.open(slides[index], '_blank');
      return;
    }

    // Create a hidden container for LightGallery if it doesn't exist
    let lgContainer = document.getElementById('lg-container');
    if (!lgContainer) {
      lgContainer = document.createElement('div');
      lgContainer.id = 'lg-container';
      lgContainer.style.display = 'none';
      document.body.appendChild(lgContainer);
    }

    // Destroy previous instance if any
    if (lgInstance) {
      lgInstance.destroy(true);
      lgInstance = null;
    }

    // Build the dynamic list of images
    const items = slides.map(src => ({
      src: src,
      thumb: src, // you can use a smaller thumbnail if you have one
    }));

    // Initialize LightGallery
    lgInstance = lightGallery(lgContainer, {
      dynamic: true,
      dynamicEl: items,
      zoom: true,
      speed: 400,
      // Add any other options you like
    });

    // Open at the clicked index
    lgInstance.openGallery(index);
  }

  // ---------- Fetch images from the static JSON ----------
  async function loadGallery() {
    try {
      const res = await fetch('gallery-list.json');
      if (!res.ok) throw new Error('Failed to fetch gallery list');
      const data = await res.json();
      
      if (data.images && data.images.length > 0) {
        slides = data.images;
        currentIndex = 0;
        renderSlider();
        startAutoPlay();
      } else {
        galleryContainer.innerHTML = `<p style="text-align:center;color:var(--ink-muted);">No images found in gallery folder.</p>`;
      }
    } catch (err) {
      console.error('Gallery load error:', err);
      galleryContainer.innerHTML = `<p style="text-align:center;color:var(--contact-brand);">Could not load gallery. Please ensure gallery-list.json exists.</p>`;
    }
  }

  // ---------- Render the slider structure ----------
  function renderSlider() {
    galleryContainer.innerHTML = `
      <div class="gallery-slider">
        <div class="slider-stack" id="slider-stack"></div>
        <div class="slider-controls">
          <button class="slider-btn prev" id="btn-prev" aria-label="Previous image">&#10094;</button>
          <button class="slider-btn next" id="btn-next" aria-label="Next image">&#10095;</button>
        </div>
        <div class="slider-counter" id="slider-counter"></div>
      </div>
    `;

    const stack = document.getElementById('slider-stack');
    // Build cards from the image list
    slides.forEach((src, index) => {
      const card = document.createElement('div');
      card.className = 'stack-card';
      // Wrap image in a clickable element (the card itself)
      card.innerHTML = `<img src="${src}" alt="Gallery image ${index + 1}">`;
      card.dataset.index = index;
      // Click on card opens the lightbox
      card.addEventListener('click', function (e) {
        e.stopPropagation(); // avoid interfering with other events
        openLightbox(parseInt(this.dataset.index));
      });
      stack.appendChild(card);
    });

    updateCards();

    // Attach navigation event listeners
    document.getElementById('btn-prev').addEventListener('click', () => {
      navigate(-1);
      resetAutoPlay();
    });
    document.getElementById('btn-next').addEventListener('click', () => {
      navigate(1);
      resetAutoPlay();
    });
  }

  // ---------- Update card positions based on currentIndex ----------
  function updateCards() {
    const cards = document.querySelectorAll('.stack-card');
    const total = slides.length;
    cards.forEach((card, idx) => {
      card.classList.remove('active', 'prev', 'next', 'stacked');
      if (idx === currentIndex) {
        card.classList.add('active');
      } else if (idx === (currentIndex - 1 + total) % total) {
        card.classList.add('prev');
      } else if (idx === (currentIndex + 1) % total) {
        card.classList.add('next');
      } else {
        card.classList.add('stacked');
      }
    });
    const counter = document.getElementById('slider-counter');
    if (counter) {
      counter.textContent = `${currentIndex + 1} / ${total}`;
    }
  }

  // ---------- Navigation ----------
  function navigate(direction) {
    if (slides.length === 0) return;
    currentIndex = (currentIndex + direction + slides.length) % slides.length;
    updateCards();
  }

  // ---------- Autoplay ----------
  function startAutoPlay() {
    stopAutoPlay();
    if (slides.length > 1) {
      autoPlayInterval = setInterval(() => navigate(1), AUTO_DELAY);
    }
  }

  function stopAutoPlay() {
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
    }
  }

  function resetAutoPlay() {
    stopAutoPlay();
    startAutoPlay();
  }

  // ---------- Expose reload for language toggle ----------
  window.renderGallery = loadGallery;

  // ---------- Load on DOM ready ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadGallery);
  } else {
    loadGallery();
  }
})();