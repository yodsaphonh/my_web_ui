const form = document.getElementById('txt2img-form');
const baseUrlInput = document.getElementById('base-url');
const modelSelect = document.getElementById('model');
const refreshModelsButton = document.getElementById('refresh-models');
const statusPanel = document.getElementById('status-panel');
const progressBar = document.getElementById('progress');
const progressText = document.getElementById('progress-text');
const etaText = document.getElementById('eta-text');
const noiseCanvas = document.getElementById('noise-canvas');
const progressImage = document.getElementById('progress-image');
const imagesContainer = document.getElementById('images');

const ctx = noiseCanvas.getContext('2d');
let animationFrameId = null;
let progressInterval = null;
let isGenerating = false;

function sanitizeBaseUrl(url) {
    return url.replace(/\/$/, '');
}

function startNoise() {
    const { width, height } = noiseCanvas;
    const imageData = ctx.createImageData(width, height);

    function drawNoise() {
        const buffer = imageData.data;
        for (let i = 0; i < buffer.length; i += 4) {
            const value = Math.random() * 255;
            buffer[i] = value;
            buffer[i + 1] = value;
            buffer[i + 2] = value;
            buffer[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        animationFrameId = requestAnimationFrame(drawNoise);
    }

    cancelAnimationFrame(animationFrameId);
    drawNoise();
}

function stopNoise() {
    cancelAnimationFrame(animationFrameId);
}

function setStatusPanelVisible(visible) {
    statusPanel.hidden = !visible;
}

function resetProgress() {
    progressBar.style.width = '0%';
    progressText.textContent = 'Waiting...';
    etaText.textContent = '';
    progressImage.hidden = true;
    progressImage.src = '';
}

function updateProgress(value, text, eta) {
    const clamped = Math.max(0, Math.min(100, value * 100));
    progressBar.style.width = `${clamped.toFixed(1)}%`;
    progressText.textContent = text ?? `Progress: ${clamped.toFixed(1)}%`;
    etaText.textContent = eta ? `ETA: ${eta.toFixed(1)}s` : '';
}

async function pollProgress(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/sdapi/v1/progress?skip_current_image=false`);
        if (!response.ok) {
            throw new Error(`Progress request failed: ${response.status}`);
        }
        const data = await response.json();
        updateProgress(data.progress ?? 0, data.state?.job ?? 'Generating...', data.eta_relative);

        if (data.current_image) {
            progressImage.src = `data:image/png;base64,${data.current_image}`;
            progressImage.hidden = false;
        }
    } catch (error) {
        console.warn('Progress error:', error);
    }
}

function stopProgressPolling() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function showError(message) {
    progressText.textContent = message;
    progressBar.style.width = '0%';
    etaText.textContent = '';
}

function clearImagesPlaceholder() {
    const placeholder = imagesContainer.querySelector('.placeholder');
    if (placeholder) {
        placeholder.remove();
    }
}

async function loadModels() {
    const baseUrl = sanitizeBaseUrl(baseUrlInput.value.trim());
    if (!baseUrl) {
        return;
    }

    refreshModelsButton.disabled = true;
    refreshModelsButton.textContent = '…';

    try {
        const response = await fetch(`${baseUrl}/sdapi/v1/sd-models`);
        if (!response.ok) {
            throw new Error(`Model list failed: ${response.status}`);
        }
        const models = await response.json();
        modelSelect.innerHTML = '<option value="">Default</option>';
        for (const model of models) {
            const option = document.createElement('option');
            option.value = model.title ?? model.model_name ?? '';
            option.textContent = model.title ?? model.model_name ?? 'Unknown Model';
            option.dataset.hash = model.hash ?? '';
            modelSelect.appendChild(option);
        }
    } catch (error) {
        console.error('Failed to load models', error);
        alert(`Unable to load models: ${error.message}`);
    } finally {
        refreshModelsButton.disabled = false;
        refreshModelsButton.textContent = '↻';
    }
}

refreshModelsButton.addEventListener('click', () => {
    loadModels();
});

baseUrlInput.addEventListener('change', () => {
    loadModels();
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isGenerating) {
        return;
    }

    const baseUrl = sanitizeBaseUrl(baseUrlInput.value.trim());
    if (!baseUrl) {
        alert('Please provide a base API URL.');
        return;
    }

    const payload = {
        prompt: document.getElementById('prompt').value,
        negative_prompt: document.getElementById('negative-prompt').value,
        width: Number(document.getElementById('width').value) || undefined,
        height: Number(document.getElementById('height').value) || undefined,
        steps: Number(document.getElementById('steps').value) || undefined,
        sampler_index: document.getElementById('sampler').value || undefined,
        cfg_scale: Number(document.getElementById('cfg-scale').value) || undefined,
        batch_size: Number(document.getElementById('batch-size').value) || undefined,
    };

    if (modelSelect.value) {
        payload.override_settings = {
            sd_model_checkpoint: modelSelect.value,
        };
        payload.override_settings_restore_afterwards = true;
    }

    try {
        isGenerating = true;
        setStatusPanelVisible(true);
        resetProgress();
        startNoise();
        pollProgress(baseUrl);
        stopProgressPolling();
        progressInterval = setInterval(() => pollProgress(baseUrl), 1500);
        progressText.textContent = 'Sending request...';
        imagesContainer.classList.add('loading');

        const response = await fetch(`${baseUrl}/sdapi/v1/txt2img`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Generation failed: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const images = data.images ?? [];
        stopNoise();
        stopProgressPolling();
        updateProgress(1, 'Completed', 0);
        etaText.textContent = '';

        if (images.length === 0) {
            showError('No images returned.');
            return;
        }

        clearImagesPlaceholder();
        imagesContainer.innerHTML = '';
        images.forEach((imageBase64, index) => {
            const img = document.createElement('img');
            img.src = `data:image/png;base64,${imageBase64}`;
            img.alt = `Generated image ${index + 1}`;
            imagesContainer.appendChild(img);
        });
    } catch (error) {
        console.error(error);
        stopNoise();
        stopProgressPolling();
        showError(error.message);
        alert(error.message);
    } finally {
        isGenerating = false;
        imagesContainer.classList.remove('loading');
    }
});

loadModels();
