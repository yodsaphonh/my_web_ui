import { initTagAutocomplete } from './tagcomplete.js';

const baseUrlInput = document.getElementById('base-url');
const modelSelect = document.getElementById('model');
const refreshModelsButton = document.getElementById('refresh-models');
const tagDatasetButton = document.getElementById('tag-dataset-button');
const tagDatasetInput = document.getElementById('tag-dataset-files');
const tagDatasetStatus = document.getElementById('tag-dataset-status');

const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

const txt2imgForm = document.getElementById('txt2img-form');
const promptInput = document.getElementById('prompt');
const negativePromptInput = document.getElementById('negative-prompt');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const stepsInput = document.getElementById('steps');
const samplerSelect = document.getElementById('sampler');
const schedulerSelect = document.getElementById('scheduler');
const cfgScaleInput = document.getElementById('cfg-scale');
const batchSizeInput = document.getElementById('batch-size');
const seedInput = document.getElementById('seed');
const restoreFacesSelect = document.getElementById('restore-faces');
const enableHrCheckbox = document.getElementById('enable-hr');
const hrSettings = document.getElementById('hr-settings');
const hrStepsInput = document.getElementById('hr-steps');
const hrSamplerSelect = document.getElementById('hr-sampler');
const hrSchedulerSelect = document.getElementById('hr-scheduler');
const hrDenoisingInput = document.getElementById('hr-denoising');
const hrUpscalerSelect = document.getElementById('hr-upscaler');
const hrScaleInput = document.getElementById('hr-scale');

const hiresForm = document.getElementById('hiresfix-form');
const hiresPromptInput = document.getElementById('hires-prompt');
const hiresNegativePromptInput = document.getElementById('hires-negative-prompt');
const hiresStepsInput = document.getElementById('hires-steps');
const hiresCfgScaleInput = document.getElementById('hires-cfg-scale');
const hiresDenoisingInput = document.getElementById('hires-denoising');
const hiresSamplerSelect = document.getElementById('hires-sampler');
const hiresSchedulerSelect = document.getElementById('hires-scheduler');
const hiresUpscalerSelect = document.getElementById('hires-upscaler');
const hiresWidthInput = document.getElementById('hires-width');
const hiresHeightInput = document.getElementById('hires-height');
const hiresBatchSizeInput = document.getElementById('hires-batch-size');
const hiresImageFileInput = document.getElementById('hires-image-file');
const hiresImagePreview = document.getElementById('hires-image-preview');
const clearHiresImageButton = document.getElementById('clear-hires-image');

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
let hiresImageBase64 = null;
let lastTxt2imgParams = null;

const numberFormatter = typeof Intl !== 'undefined' && Intl.NumberFormat ? new Intl.NumberFormat() : null;
let currentTagDatasetStats = { tagCount: 0, sourceCount: 0 };

function formatNumber(value) {
    if (!Number.isFinite(value)) {
        return '0';
    }
    return numberFormatter ? numberFormatter.format(value) : String(value);
}

function setTagDatasetStatus(message, tone = 'neutral') {
    if (!tagDatasetStatus) {
        return;
    }
    tagDatasetStatus.textContent = message;
    tagDatasetStatus.classList.remove('is-error', 'is-success');
    if (tone === 'error') {
        tagDatasetStatus.classList.add('is-error');
    } else if (tone === 'success') {
        tagDatasetStatus.classList.add('is-success');
    }
}

function updateTagDatasetStats(stats, context = {}) {
    if (!tagDatasetStatus) {
        currentTagDatasetStats = stats ?? currentTagDatasetStats;
        return;
    }

    const previous = context.previous ?? currentTagDatasetStats;
    const tagCount = Number.isFinite(stats?.tagCount) ? stats.tagCount : 0;
    const sourceCount = Number.isFinite(stats?.sourceCount) ? stats.sourceCount : 0;

    if (tagCount <= 0) {
        currentTagDatasetStats = { tagCount: 0, sourceCount: 0 };
        const message =
            context.tone === 'error'
                ? 'Autocomplete dataset failed to load. Add CSV or JSON files to enable suggestions.'
                : 'Autocomplete dataset not loaded yet. Add CSV or JSON files to enable suggestions.';
        setTagDatasetStatus(message, context.tone ?? 'neutral');
        return;
    }

    currentTagDatasetStats = { tagCount, sourceCount };

    const base = `Autocomplete ready: ${formatNumber(tagCount)} tags from ${formatNumber(sourceCount)} source${sourceCount === 1 ? '' : 's'}.`;

    if (context.filesAdded) {
        const delta = tagCount - (Number.isFinite(previous?.tagCount) ? previous.tagCount : 0);
        const additionSummary =
            delta > 0 ? `${formatNumber(delta)} new tag${delta === 1 ? '' : 's'}` : 'no new tags';
        setTagDatasetStatus(
            `${base} Merged ${context.filesAdded} file${context.filesAdded === 1 ? '' : 's'} (${additionSummary}).`,
            delta > 0 ? 'success' : 'neutral',
        );
        return;
    }

    setTagDatasetStatus(base, context.tone ?? 'neutral');
}

const tagAutocompletePromise = initTagAutocomplete([
    promptInput,
    negativePromptInput,
    hiresPromptInput,
    hiresNegativePromptInput,
]);

tagAutocompletePromise
    .then((controller) => {
        if (!controller) {
            setTagDatasetStatus('Tag autocomplete is unavailable on this page.', 'error');
            return null;
        }
        const stats = controller.getStats();
        updateTagDatasetStats(stats, { tone: 'neutral' });
        return controller;
    })
    .catch((error) => {
        console.warn('Failed to initialize tag autocomplete:', error);
        setTagDatasetStatus('Unable to load autocomplete dataset. Add CSV or JSON files to enable suggestions.', 'error');
    });

if (tagDatasetButton && tagDatasetInput) {
    tagDatasetButton.addEventListener('click', () => {
        tagDatasetInput.value = '';
        tagDatasetInput.click();
    });

    tagDatasetInput.addEventListener('change', async () => {
        const files = Array.from(tagDatasetInput.files ?? []).filter((file) => file && file.size > 0);
        if (files.length === 0) {
            return;
        }

        try {
            const controller = await tagAutocompletePromise;
            if (!controller) {
                setTagDatasetStatus('Tag autocomplete is unavailable on this page.', 'error');
                return;
            }

            const previous = currentTagDatasetStats;
            const stats = await controller.mergeFiles(files);
            updateTagDatasetStats(stats, { filesAdded: files.length, previous });
        } catch (error) {
            console.error('Failed to import tag dataset files:', error);
            setTagDatasetStatus('Failed to read the selected files.', 'error');
        } finally {
            tagDatasetInput.value = '';
        }
    });
}

function sanitizeBaseUrl(url) {
    return url.replace(/\/$/, '');
}

function switchTab(targetId) {
    tabButtons.forEach((button) => {
        const isActive = button.dataset.tabTarget === targetId;
        button.classList.toggle('active', isActive);
    });
    tabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.id === targetId);
    });
}

tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
        switchTab(button.dataset.tabTarget);
    });
});

if (enableHrCheckbox) {
    enableHrCheckbox.addEventListener('change', () => {
        hrSettings.hidden = !enableHrCheckbox.checked;
    });
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

function renderImages(images) {
    if (!images || images.length === 0) {
        showError('No images returned.');
        return;
    }

    clearImagesPlaceholder();
    imagesContainer.innerHTML = '';

    images.forEach((imageBase64, index) => {
        const card = document.createElement('div');
        card.className = 'image-card';

        const img = document.createElement('img');
        img.src = `data:image/png;base64,${imageBase64}`;
        img.alt = `Generated image ${index + 1}`;
        card.appendChild(img);

        const sendButton = document.createElement('button');
        sendButton.type = 'button';
        sendButton.textContent = 'Send to Hires Fix';
        sendButton.addEventListener('click', () => {
            populateHiresFix(imageBase64);
            switchTab('hiresfix-tab');
        });
        card.appendChild(sendButton);

        imagesContainer.appendChild(card);
    });
}

function populateHiresFix(imageBase64) {
    const dataUrl = `data:image/png;base64,${imageBase64}`;
    setHiresImage(dataUrl, imageBase64);

    const params = lastTxt2imgParams ?? {};

    hiresPromptInput.value = params.prompt ?? promptInput.value;
    hiresNegativePromptInput.value = params.negative_prompt ?? negativePromptInput.value;
    hiresStepsInput.value = params.hr_second_pass_steps ?? params.steps ?? hiresStepsInput.value;
    hiresCfgScaleInput.value = params.hr_cfg ?? params.cfg_scale ?? hiresCfgScaleInput.value;
    hiresDenoisingInput.value = params.hr_denoising ?? params.denoising_strength ?? hiresDenoisingInput.value;

    if (params.hr_sampler_name && hiresSamplerSelect.querySelector(`option[value="${params.hr_sampler_name}"]`)) {
        hiresSamplerSelect.value = params.hr_sampler_name;
    } else if (params.sampler_name && hiresSamplerSelect.querySelector(`option[value="${params.sampler_name}"]`)) {
        hiresSamplerSelect.value = params.sampler_name;
    }

    if (params.hr_scheduler && hiresSchedulerSelect.querySelector(`option[value="${params.hr_scheduler}"]`)) {
        hiresSchedulerSelect.value = params.hr_scheduler;
    } else if (params.scheduler && hiresSchedulerSelect.querySelector(`option[value="${params.scheduler}"]`)) {
        hiresSchedulerSelect.value = params.scheduler;
    }

    if (params.hr_upscaler && hiresUpscalerSelect.querySelector(`option[value="${params.hr_upscaler}"]`)) {
        hiresUpscalerSelect.value = params.hr_upscaler;
    }

    const baseWidth = Number(params.width ?? widthInput.value ?? 0);
    const baseHeight = Number(params.height ?? heightInput.value ?? 0);
    const scale = Number(params.hr_scale ?? hrScaleInput.value ?? 1);
    if (baseWidth) {
        hiresWidthInput.value = Math.round(baseWidth * scale);
    }
    if (baseHeight) {
        hiresHeightInput.value = Math.round(baseHeight * scale);
    }

    if (params.batch_size) {
        hiresBatchSizeInput.value = params.batch_size;
    }
}

function setHiresImage(dataUrl, base64) {
    if (dataUrl && base64) {
        hiresImageBase64 = base64;
        hiresImagePreview.src = dataUrl;
        hiresImagePreview.hidden = false;
    } else {
        hiresImageBase64 = null;
        hiresImagePreview.src = '';
        hiresImagePreview.hidden = true;
        hiresImageFileInput.value = '';
    }
}

function handleHiresImageFile(file) {
    if (!file) {
        setHiresImage(null, null);
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const dataUrl = event.target?.result;
        if (typeof dataUrl === 'string' && dataUrl.includes(',')) {
            const [, base64] = dataUrl.split(',', 2);
            setHiresImage(dataUrl, base64);
        }
    };
    reader.readAsDataURL(file);
}

hiresImageFileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    handleHiresImageFile(file ?? null);
});

clearHiresImageButton.addEventListener('click', () => {
    setHiresImage(null, null);
});

function populateSelect(select, options, placeholderLabel = 'Default') {
    const previous = select.value;
    select.innerHTML = '';

    if (placeholderLabel !== null) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = placeholderLabel;
        select.appendChild(placeholder);
    }

    let hasPrevious = false;

    options.forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label;
        select.appendChild(opt);
        if (option.value === previous) {
            hasPrevious = true;
        }
    });

    if (hasPrevious) {
        select.value = previous;
    }
}

async function fetchList(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load list: ${response.status}`);
    }
    return response.json();
}

async function loadModels() {
    const baseUrl = sanitizeBaseUrl(baseUrlInput.value.trim());
    if (!baseUrl) {
        return;
    }

    refreshModelsButton.disabled = true;
    const previousValue = modelSelect.value;
    modelSelect.innerHTML = '<option value="">Loading…</option>';

    try {
        const models = await fetchList(`${baseUrl}/sdapi/v1/sd-models`);
        modelSelect.innerHTML = '<option value="">Default</option>';
        models.forEach((model) => {
            const option = document.createElement('option');
            option.value = model.title ?? model.model_name ?? '';
            option.textContent = model.title ?? model.model_name ?? 'Unknown Model';
            option.dataset.hash = model.hash ?? '';
            modelSelect.appendChild(option);
        });
        if (previousValue && modelSelect.querySelector(`option[value="${previousValue}"]`)) {
            modelSelect.value = previousValue;
        }
    } catch (error) {
        console.error('Failed to load models', error);
        alert(`Unable to load models: ${error.message}`);
        modelSelect.innerHTML = '<option value="">Default</option>';
    } finally {
        refreshModelsButton.disabled = false;
    }
}

function setLoadingStateForSelects(selects, label) {
    selects.forEach((select) => {
        select.innerHTML = `<option value="">${label}</option>`;
    });
}

async function loadSamplers() {
    const baseUrl = sanitizeBaseUrl(baseUrlInput.value.trim());
    if (!baseUrl) {
        return;
    }

    const targets = [samplerSelect, hrSamplerSelect, hiresSamplerSelect];
    setLoadingStateForSelects(targets, 'Loading…');

    try {
        const samplers = await fetchList(`${baseUrl}/sdapi/v1/samplers`);
        const options = samplers
            .map((sampler) => sampler.name ?? sampler.title ?? '')
            .filter((name) => Boolean(name))
            .map((name) => ({ value: name, label: name }));
        targets.forEach((select) => populateSelect(select, options));
    } catch (error) {
        console.error('Failed to load samplers', error);
        const fallback = ['Euler a', 'Euler', 'LMS', 'DDIM', 'DPM++ 2M'];
        const options = fallback.map((name) => ({ value: name, label: name }));
        targets.forEach((select) => populateSelect(select, options));
    }
}

async function loadSchedulers() {
    const baseUrl = sanitizeBaseUrl(baseUrlInput.value.trim());
    if (!baseUrl) {
        return;
    }

    const targets = [schedulerSelect, hrSchedulerSelect, hiresSchedulerSelect];
    setLoadingStateForSelects(targets, 'Loading…');

    try {
        const schedulers = await fetchList(`${baseUrl}/sdapi/v1/schedulers`);
        const options = schedulers
            .map((item) => item.name ?? item.title ?? '')
            .filter((name) => Boolean(name))
            .map((name) => ({ value: name, label: name }));
        targets.forEach((select) => populateSelect(select, options));
    } catch (error) {
        console.error('Failed to load schedulers', error);
        const fallback = ['Automatic', 'Karras', 'Exponential', 'SGM'];
        const options = fallback.map((name) => ({ value: name, label: name }));
        targets.forEach((select) => populateSelect(select, options));
    }
}

async function loadUpscalers() {
    const baseUrl = sanitizeBaseUrl(baseUrlInput.value.trim());
    if (!baseUrl) {
        return;
    }

    const targets = [hrUpscalerSelect, hiresUpscalerSelect];
    setLoadingStateForSelects(targets, 'Loading…');

    try {
        const upscalers = await fetchList(`${baseUrl}/sdapi/v1/upscalers`);
        const options = upscalers
            .map((upscaler) => upscaler.name ?? upscaler.model_name ?? '')
            .filter((name) => Boolean(name))
            .map((name) => ({ value: name, label: name }));
        targets.forEach((select) => populateSelect(select, options));
    } catch (error) {
        console.error('Failed to load upscalers', error);
        const fallback = ['Latent', 'Latent (antialiased)', 'Latent (bicubic)', '4x-UltraSharp'];
        const options = fallback.map((name) => ({ value: name, label: name }));
        targets.forEach((select) => populateSelect(select, options));
    }
}

function loadAllOptions() {
    const baseUrl = sanitizeBaseUrl(baseUrlInput.value.trim());
    if (!baseUrl) {
        return;
    }

    loadModels();
    loadSamplers();
    loadSchedulers();
    loadUpscalers();
}

refreshModelsButton.addEventListener('click', () => {
    loadModels();
});

baseUrlInput.addEventListener('change', () => {
    loadAllOptions();
});

function buildOverrideSettings() {
    if (!modelSelect.value) {
        return undefined;
    }

    return {
        sd_model_checkpoint: modelSelect.value,
    };
}

async function submitGeneration(endpoint, payload) {
    if (isGenerating) {
        return null;
    }

    const baseUrl = sanitizeBaseUrl(baseUrlInput.value.trim());
    if (!baseUrl) {
        alert('Please provide a base API URL.');
        return null;
    }

    try {
        isGenerating = true;
        setStatusPanelVisible(true);
        resetProgress();
        startNoise();
        stopProgressPolling();
        pollProgress(baseUrl);
        progressInterval = setInterval(() => pollProgress(baseUrl), 1500);
        progressText.textContent = 'Sending request...';
        imagesContainer.classList.add('loading');

        const response = await fetch(`${baseUrl}${endpoint}`, {
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
        stopNoise();
        stopProgressPolling();
        updateProgress(1, 'Completed', 0);
        etaText.textContent = '';

        renderImages(data.images ?? []);
        return data;
    } catch (error) {
        console.error(error);
        stopNoise();
        stopProgressPolling();
        showError(error.message);
        alert(error.message);
        return null;
    } finally {
        isGenerating = false;
        imagesContainer.classList.remove('loading');
    }
}

txt2imgForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isGenerating) {
        return;
    }

    const payload = {
        prompt: promptInput.value,
        negative_prompt: negativePromptInput.value,
        width: Number(widthInput.value) || undefined,
        height: Number(heightInput.value) || undefined,
        steps: Number(stepsInput.value) || undefined,
        sampler_name: samplerSelect.value || undefined,
        scheduler: schedulerSelect.value || undefined,
        cfg_scale: Number(cfgScaleInput.value) || undefined,
        batch_size: Number(batchSizeInput.value) || undefined,
        seed: seedInput.value !== '' ? Number(seedInput.value) : undefined,
        restore_faces: restoreFacesSelect.value === 'true' ? true : restoreFacesSelect.value === 'false' ? false : undefined,
        enable_hr: enableHrCheckbox.checked,
        override_settings: buildOverrideSettings(),
        override_settings_restore_afterwards: Boolean(modelSelect.value),
    };

    if (!enableHrCheckbox.checked) {
        delete payload.enable_hr;
    } else {
        payload.hr_second_pass_steps = Number(hrStepsInput.value) || undefined;
        payload.hr_sampler_name = hrSamplerSelect.value || undefined;
        payload.hr_scheduler = hrSchedulerSelect.value || undefined;
        payload.hr_scale = Number(hrScaleInput.value) || undefined;
        payload.hr_upscaler = hrUpscalerSelect.value || undefined;
        payload.denoising_strength = Number(hrDenoisingInput.value) || undefined;
    }

    lastTxt2imgParams = {
        prompt: payload.prompt,
        negative_prompt: payload.negative_prompt,
        steps: payload.steps,
        cfg_scale: payload.cfg_scale,
        batch_size: payload.batch_size,
        sampler_name: payload.sampler_name,
        scheduler: payload.scheduler,
        width: payload.width,
        height: payload.height,
        seed: payload.seed,
        enable_hr: enableHrCheckbox.checked,
        hr_second_pass_steps: enableHrCheckbox.checked ? payload.hr_second_pass_steps : undefined,
        hr_sampler_name: enableHrCheckbox.checked ? payload.hr_sampler_name : undefined,
        hr_scheduler: enableHrCheckbox.checked ? payload.hr_scheduler : undefined,
        hr_upscaler: enableHrCheckbox.checked ? payload.hr_upscaler : undefined,
        hr_scale: enableHrCheckbox.checked ? payload.hr_scale : undefined,
        denoising_strength: enableHrCheckbox.checked ? payload.denoising_strength : undefined,
    };

    await submitGeneration('/sdapi/v1/txt2img', payload);
});

hiresForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isGenerating) {
        return;
    }

    if (!hiresImageBase64) {
        alert('Please provide an image for Hires Fix.');
        return;
    }

    const payload = {
        prompt: hiresPromptInput.value,
        negative_prompt: hiresNegativePromptInput.value,
        steps: Number(hiresStepsInput.value) || undefined,
        cfg_scale: Number(hiresCfgScaleInput.value) || undefined,
        denoising_strength: Number(hiresDenoisingInput.value) || undefined,
        sampler_name: hiresSamplerSelect.value || undefined,
        scheduler: hiresSchedulerSelect.value || undefined,
        batch_size: Number(hiresBatchSizeInput.value) || undefined,
        width: Number(hiresWidthInput.value) || undefined,
        height: Number(hiresHeightInput.value) || undefined,
        init_images: [hiresImageBase64],
        override_settings: buildOverrideSettings(),
        override_settings_restore_afterwards: Boolean(modelSelect.value),
    };

    if (hiresUpscalerSelect.value) {
        payload.upscaler = hiresUpscalerSelect.value;
    }

    await submitGeneration('/sdapi/v1/img2img', payload);
});

loadAllOptions();

switchTab('txt2img-tab');
