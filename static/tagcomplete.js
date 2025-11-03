const DEFAULT_DATA_URL = '/tagcomplete-data.json';
const DEFAULT_MANIFEST_URL = '/tagcomplete-sources.json';
const MAX_RESULTS = 20;

const CATEGORY_MAP = {
    '0': 'general',
    '1': 'artist',
    '2': 'general',
    '3': 'copyright',
    '4': 'character',
    '5': 'meta',
    general: 'general',
    artist: 'artist',
    copyright: 'copyright',
    character: 'character',
    meta: 'meta',
};

const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;

function normalize(str) {
    return (str ?? '').toLowerCase().trim();
}

function isNumeric(value) {
    return NUMBER_PATTERN.test(value ?? '');
}

function guessFormatFromUrl(url) {
    if (typeof url !== 'string') {
        return 'json';
    }
    const lower = url.toLowerCase();
    if (lower.endsWith('.csv')) {
        return 'csv';
    }
    if (lower.endsWith('.json')) {
        return 'json';
    }
    return 'json';
}

function expandAliasValue(value) {
    const trimmed = value?.trim();
    if (!trimmed) {
        return [];
    }

    const results = new Set();
    const segments = trimmed
        .split(/[|;,]/)
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length === 0) {
        segments.push(trimmed);
    }

    segments.forEach((segment) => {
        if (!segment) {
            return;
        }
        results.add(segment);

        const normalized = segment.replace(/\s+/g, ' ').trim();
        if (normalized && normalized.includes(' ')) {
            results.add(normalized.replace(/\s+/g, '_'));
            normalized.split(' ').forEach((part) => {
                if (part.length > 1) {
                    results.add(part);
                }
            });
        }
    });

    return Array.from(results);
}

function buildSynonyms(tag, aliases, description) {
    const synonyms = new Set();

    const addNormalized = (value) => {
        const normalizedValue = normalize(value);
        if (normalizedValue) {
            synonyms.add(normalizedValue);
        }
    };

    const addParts = (value) => {
        if (!value) {
            return;
        }
        const expanded = value.replace(/[_-]/g, ' ').split(/\s+/);
        expanded.forEach((part) => {
            if (part.length > 1) {
                addNormalized(part);
            }
        });
    };

    addNormalized(tag);
    addParts(tag);

    aliases.forEach((alias) => {
        addNormalized(alias);
        addParts(alias);
    });

    if (description) {
        addNormalized(description);
        addParts(description);
    }

    return Array.from(synonyms);
}

function createRecord(tag, { aliases = [], category = '', description = '' } = {}) {
    if (!tag) {
        return null;
    }

    const aliasSet = new Set();
    aliases.forEach((alias) => {
        const trimmed = typeof alias === 'string' ? alias.trim() : '';
        if (!trimmed) {
            return;
        }
        if (trimmed.toLowerCase() === tag.toLowerCase()) {
            return;
        }
        aliasSet.add(trimmed);
    });

    return {
        tag,
        aliases: aliasSet,
        category: category ?? '',
        description: description ?? '',
    };
}

function finalizeRecord(record) {
    const aliases = Array.from(record.aliases ?? [])
        .map((alias) => alias.trim())
        .filter(Boolean);
    const uniqueAliases = Array.from(new Set(aliases));
    const description = record.description ?? '';
    const category = record.category ?? '';

    return {
        tag: record.tag,
        aliases: uniqueAliases,
        category,
        description,
        synonyms: buildSynonyms(record.tag, uniqueAliases, description),
    };
}

function normalizeToRecord(entry) {
    if (!entry || !entry.tag) {
        return null;
    }

    if (entry.aliases instanceof Set) {
        return {
            tag: entry.tag,
            aliases: new Set(entry.aliases),
            category: entry.category ?? '',
            description: entry.description ?? '',
        };
    }

    const aliases = Array.isArray(entry.aliases)
        ? entry.aliases
        : typeof entry.alias === 'string'
          ? [entry.alias]
          : [];

    return createRecord(entry.tag, {
        aliases,
        category: entry.category ?? '',
        description: entry.description ?? '',
    });
}

function mergeRecord(map, record) {
    if (!record || !record.tag) {
        return;
    }

    const existing = map.get(record.tag);
    if (!existing) {
        map.set(record.tag, {
            tag: record.tag,
            aliases: new Set(record.aliases ?? []),
            category: record.category ?? '',
            description: record.description ?? '',
        });
        return;
    }

    (record.aliases ?? new Set()).forEach((alias) => {
        if (!alias) {
            return;
        }
        if (alias.toLowerCase() === record.tag.toLowerCase()) {
            return;
        }
        existing.aliases.add(alias);
    });

    if (!existing.category && record.category) {
        existing.category = record.category;
    }

    if (!existing.description && record.description) {
        existing.description = record.description;
    }
}

function mergeDatasets(collections) {
    const map = new Map();
    const sourcesMap = new Map();

    collections.forEach((collection) => {
        if (Array.isArray(collection?.sources)) {
            collection.sources.forEach((source) => {
                if (!source) {
                    return;
                }
                const id = source.id ?? source.label ?? `source-${sourcesMap.size}`;
                const existingSource = sourcesMap.get(id);
                if (existingSource) {
                    existingSource.size = (existingSource.size ?? 0) + (source.size ?? 0);
                } else {
                    sourcesMap.set(id, {
                        id,
                        label: source.label ?? id,
                        type: source.type ?? '',
                        size: source.size ?? 0,
                    });
                }
            });
        }

        if (!Array.isArray(collection?.dataset)) {
            return;
        }

        collection.dataset.forEach((entry) => {
            const record = normalizeToRecord(entry);
            if (!record) {
                return;
            }
            mergeRecord(map, record);
        });
    });

    const dataset = Array.from(map.values()).map(finalizeRecord);
    dataset.sort((a, b) => a.tag.localeCompare(b.tag));

    return {
        dataset,
        sources: Array.from(sourcesMap.values()),
    };
}

function parseManifest(data) {
    if (!data) {
        return [];
    }

    const normalizeSource = (source) => {
        if (!source) {
            return null;
        }
        if (typeof source === 'string') {
            const format = guessFormatFromUrl(source);
            return { url: source, format, label: source };
        }
        if (typeof source !== 'object') {
            return null;
        }
        if (!source.url) {
            return null;
        }
        const format = (source.format ?? source.type ?? guessFormatFromUrl(source.url)).toLowerCase();
        const label = source.label ?? source.name ?? source.url;
        return {
            url: source.url,
            format,
            label,
        };
    };

    const items = Array.isArray(data) ? data : Array.isArray(data.datasets) ? data.datasets : [];
    return items.map(normalizeSource).filter(Boolean);
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load ${url} (${response.status})`);
    }
    return response.json();
}

async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load ${url} (${response.status})`);
    }
    return response.text();
}

function parseJsonDataset(raw) {
    if (!Array.isArray(raw)) {
        throw new Error('Tagcomplete data is not an array');
    }

    return raw
        .map((item) => {
            const tag = item?.tag ?? item?.name;
            if (!tag) {
                return null;
            }
            const aliases = Array.isArray(item.aliases) ? item.aliases : [];
            const category = item.category ?? '';
            const description = item.description ?? '';
            return createRecord(tag, { aliases, category, description });
        })
        .filter(Boolean);
}

function parseCsv(text) {
    const rows = [];
    let current = [];
    let value = '';
    let inQuotes = false;

    const pushValue = () => {
        current.push(value);
        value = '';
    };

    const pushRow = () => {
        if (current.length > 0) {
            rows.push(current);
        }
        current = [];
    };

    const input = text.startsWith('\ufeff') ? text.slice(1) : text;

    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];

        if (inQuotes) {
            if (char === '"') {
                const nextChar = input[index + 1];
                if (nextChar === '"') {
                    value += '"';
                    index += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                value += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            pushValue();
        } else if (char === '\n') {
            pushValue();
            pushRow();
        } else if (char === '\r') {
            // ignore carriage returns
        } else {
            value += char;
        }
    }

    if (value || current.length > 0) {
        pushValue();
    }
    if (current.length > 0) {
        pushRow();
    }

    return rows;
}

function parseCsvDataset(text) {
    const rows = parseCsv(text);
    const records = [];

    rows.forEach((row) => {
        if (!Array.isArray(row) || row.length === 0) {
            return;
        }
        const trimmed = row.map((cell) => cell.trim());
        const rawTag = trimmed[0];
        if (!rawTag || rawTag.startsWith('#')) {
            return;
        }
        const tag = rawTag;
        let category = '';
        let description = '';
        let descriptionAssigned = false;
        const aliasValues = [];

        for (let index = 1; index < trimmed.length; index += 1) {
            const value = trimmed[index];
            if (!value) {
                continue;
            }

            const mappedCategory = CATEGORY_MAP[value];
            if (!category && mappedCategory) {
                category = mappedCategory;
                continue;
            }

            if (isNumeric(value)) {
                continue;
            }

            if (!descriptionAssigned && value.includes(' ')) {
                description = value;
                descriptionAssigned = true;
            }

            expandAliasValue(value).forEach((alias) => aliasValues.push(alias));
        }

        const record = createRecord(tag, { aliases: aliasValues, category, description });
        if (record) {
            records.push(record);
        }
    });

    return records;
}

function createSourceInfo(source, size) {
    const format = (source?.format ?? source?.type ?? guessFormatFromUrl(source?.url ?? source?.label ?? '')).toLowerCase();
    const id = source?.url ?? source?.id ?? source?.label ?? `source-${Math.random().toString(16).slice(2)}`;
    return {
        id,
        label: source?.label ?? source?.url ?? id,
        type: format,
        size,
    };
}

async function loadManifest(manifestUrl) {
    try {
        const data = await fetchJson(manifestUrl);
        return parseManifest(data);
    } catch (error) {
        console.warn('Unable to load tagcomplete manifest:', error);
        return [];
    }
}

async function loadSourceDataset(source) {
    const format = (source.format ?? 'json').toLowerCase();
    if (format === 'csv') {
        const text = await fetchText(source.url);
        return parseCsvDataset(text);
    }
    const data = await fetchJson(source.url);
    return parseJsonDataset(data);
}

async function parseLocalFile(file) {
    if (!file) {
        return { dataset: [], sources: [] };
    }

    const name = file.name ?? 'dataset';
    const formatHint = guessFormatFromUrl(name);
    const text = await file.text();

    const tryParsers = [];
    if (formatHint === 'csv') {
        tryParsers.push(() => parseCsvDataset(text));
        tryParsers.push(() => parseJsonDataset(JSON.parse(text)));
    } else {
        tryParsers.push(() => parseJsonDataset(JSON.parse(text)));
        tryParsers.push(() => parseCsvDataset(text));
    }

    let dataset = [];
    for (const parser of tryParsers) {
        try {
            dataset = parser();
            if (Array.isArray(dataset)) {
                break;
            }
        } catch (error) {
            dataset = [];
        }
    }

    if (!Array.isArray(dataset)) {
        dataset = [];
    }

    return {
        dataset,
        sources: [
            {
                id: `file:${name}`,
                label: name,
                type: formatHint,
                size: dataset.length,
            },
        ],
    };
}

async function loadTagDataset(options = {}) {
    const collections = [];

    if (Array.isArray(options.files) && options.files.length > 0) {
        for (const file of options.files) {
            try {
                const parsed = await parseLocalFile(file);
                if (parsed.dataset.length > 0) {
                    collections.push(parsed);
                }
            } catch (error) {
                console.warn('Unable to parse tagcomplete file:', file?.name ?? '(unknown)', error);
            }
        }
    } else {
        let sources = [];
        if (Array.isArray(options.sources) && options.sources.length > 0) {
            sources = options.sources;
        } else {
            sources = await loadManifest(options.manifestUrl ?? DEFAULT_MANIFEST_URL);
        }

        if (sources.length === 0) {
            const fallbackUrl = options.dataUrl ?? DEFAULT_DATA_URL;
            sources = [
                {
                    url: fallbackUrl,
                    format: guessFormatFromUrl(fallbackUrl),
                    label: fallbackUrl,
                },
            ];
        }

        for (const source of sources) {
            try {
                const dataset = await loadSourceDataset(source);
                collections.push({
                    dataset,
                    sources: [createSourceInfo(source, dataset.length)],
                });
            } catch (error) {
                console.warn('Unable to load tagcomplete dataset from', source.url ?? source.label, error);
            }
        }
    }

    return mergeDatasets(collections);
}

class TagAutocomplete {
    constructor(textarea, dataset) {
        this.textarea = textarea;
        this.dataset = Array.isArray(dataset) ? dataset : [];
        this.suggestions = [];
        this.activeIndex = -1;
        this.token = null;
        this.blurTimeout = null;

        this.container = document.createElement('div');
        this.container.className = 'tag-suggestions';
        this.container.hidden = true;
        document.body.appendChild(this.container);

        this.handleInput = this.handleInput.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleBlur = this.handleBlur.bind(this);
        this.handleFocus = this.handleFocus.bind(this);
        this.handleScroll = this.handleScroll.bind(this);

        textarea.addEventListener('input', this.handleInput);
        textarea.addEventListener('keydown', this.handleKeyDown);
        textarea.addEventListener('blur', this.handleBlur);
        textarea.addEventListener('focus', this.handleFocus);
        window.addEventListener('scroll', this.handleScroll, true);
        window.addEventListener('resize', this.handleScroll);
    }

    destroy() {
        this.textarea.removeEventListener('input', this.handleInput);
        this.textarea.removeEventListener('keydown', this.handleKeyDown);
        this.textarea.removeEventListener('blur', this.handleBlur);
        this.textarea.removeEventListener('focus', this.handleFocus);
        window.removeEventListener('scroll', this.handleScroll, true);
        window.removeEventListener('resize', this.handleScroll);
        this.container.remove();
    }

    updateDataset(dataset) {
        this.dataset = Array.isArray(dataset) ? dataset : [];
        if (!this.container.hidden) {
            this.updateSuggestions();
        }
    }

    handleInput() {
        this.updateSuggestions();
    }

    handleFocus() {
        this.updateSuggestions();
    }

    handleBlur() {
        this.blurTimeout = window.setTimeout(() => this.hideSuggestions(), 120);
    }

    handleScroll() {
        if (!this.container.hidden) {
            this.positionContainer();
        }
    }

    handleKeyDown(event) {
        if (this.container.hidden || this.suggestions.length === 0) {
            return;
        }

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.setActiveIndex((this.activeIndex + 1) % this.suggestions.length);
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.setActiveIndex(
                    (this.activeIndex - 1 + this.suggestions.length) % this.suggestions.length,
                );
                break;
            case 'Tab':
            case 'Enter':
                if (this.activeIndex >= 0) {
                    event.preventDefault();
                    this.applySuggestion(this.suggestions[this.activeIndex].item.tag);
                }
                break;
            case 'Escape':
                this.hideSuggestions();
                break;
            default:
                break;
        }
    }

    setActiveIndex(index) {
        this.activeIndex = index;
        const buttons = this.container.querySelectorAll('.tag-suggestion');
        buttons.forEach((button, idx) => {
            button.classList.toggle('active', idx === index);
        });
    }

    extractToken() {
        const value = this.textarea.value;
        const cursor = this.textarea.selectionStart ?? 0;
        const before = value.slice(0, cursor);
        const after = value.slice(cursor);

        const start = Math.max(-1, before.lastIndexOf(','), before.lastIndexOf('\n'), before.lastIndexOf('\r'));
        const tokenStart = start + 1;

        const tokenWithSpaces = before.slice(tokenStart);
        const leadingSpaces = tokenWithSpaces.match(/^\s*/)?.[0]?.length ?? 0;
        const cleanedStart = tokenStart + leadingSpaces;

        let tokenEnd = cursor;
        const commaOffset = after.indexOf(',');
        const newlineOffset = after.search(/[\n\r]/);
        const candidates = [commaOffset, newlineOffset].filter((offset) => offset >= 0);
        if (candidates.length > 0) {
            tokenEnd = cursor + Math.min(...candidates);
        }

        const tokenValue = value.slice(cleanedStart, cursor);

        return {
            start: cleanedStart,
            end: tokenEnd,
            value: tokenValue.trimStart(),
            rawValue: value.slice(cleanedStart, tokenEnd),
        };
    }

    updateSuggestions() {
        if (this.blurTimeout) {
            window.clearTimeout(this.blurTimeout);
            this.blurTimeout = null;
        }

        this.token = this.extractToken();
        const query = this.token?.value ?? '';

        if (!query || query.length < 1) {
            this.hideSuggestions();
            return;
        }

        this.suggestions = buildSuggestionList(this.dataset, query);

        if (this.suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }

        this.renderSuggestions();
        this.positionContainer();
        this.container.hidden = false;
        this.setActiveIndex(0);
    }

    renderSuggestions() {
        this.container.innerHTML = '';
        this.suggestions.forEach((suggestion, index) => {
            const element = createSuggestionElement(suggestion, index);
            element.addEventListener('mousedown', (event) => {
                event.preventDefault();
                if (this.blurTimeout) {
                    window.clearTimeout(this.blurTimeout);
                    this.blurTimeout = null;
                }
                this.applySuggestion(suggestion.item.tag);
            });
            this.container.appendChild(element);
        });
    }

    positionContainer() {
        const rect = this.textarea.getBoundingClientRect();
        this.container.style.width = `${rect.width}px`;
        this.container.style.left = `${rect.left + window.scrollX}px`;
        this.container.style.top = `${rect.bottom + window.scrollY + 4}px`;
    }

    applySuggestion(tag) {
        if (!this.token) {
            return;
        }

        const value = this.textarea.value;
        const before = value.slice(0, this.token.start);
        let after = value.slice(this.token.end);

        const hasCommaBefore = before.includes(',');
        const needsLeadingComma =
            hasCommaBefore && before.trim().length > 0 && !before.trimEnd().endsWith(',');
        const trimmedBefore = needsLeadingComma ? `${before.replace(/\s*$/, '')}, ` : before;

        if (after.startsWith(',')) {
            after = after.replace(/^,(?!\s)/, ', ');
        } else if (after.length > 0 && !after.startsWith('\n')) {
            after = after.replace(/^\s*/, '');
            after = `, ${after}`;
        }

        const newValue = `${trimmedBefore}${tag}${after}`;
        this.textarea.value = newValue;

        const cursor = trimmedBefore.length + tag.length;
        this.textarea.selectionStart = cursor;
        this.textarea.selectionEnd = cursor;
        this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
        this.hideSuggestions();
    }

    hideSuggestions() {
        this.suggestions = [];
        this.container.hidden = true;
        this.activeIndex = -1;
    }
}

function scoreMatch(synonyms, query) {
    const scores = synonyms.map((synonym) => {
        if (synonym.startsWith(query)) {
            return synonym === query ? 0 : 1;
        }
        const index = synonym.indexOf(query);
        return index === -1 ? Infinity : 2 + index;
    });
    return Math.min(...scores);
}

function buildSuggestionList(dataset, query) {
    const normalized = normalize(query);
    if (!normalized) {
        return [];
    }
    return dataset
        .map((item) => ({
            item,
            score: scoreMatch(item.synonyms, normalized),
        }))
        .filter(({ score }) => Number.isFinite(score))
        .sort((a, b) => {
            if (a.score !== b.score) {
                return a.score - b.score;
            }
            return a.item.tag.localeCompare(b.item.tag);
        })
        .slice(0, MAX_RESULTS);
}

function createSuggestionElement({ item }, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tag-suggestion';
    button.dataset.index = String(index);

    const name = document.createElement('span');
    name.className = 'tag-suggestion__tag';
    name.textContent = item.tag;
    button.appendChild(name);

    if (item.aliases.length > 0) {
        const alias = document.createElement('span');
        alias.className = 'tag-suggestion__alias';
        alias.textContent = item.aliases.slice(0, 2).join(', ');
        button.appendChild(alias);
    }

    if (item.category || item.description) {
        const meta = document.createElement('span');
        meta.className = 'tag-suggestion__meta';
        meta.textContent = [item.category, item.description].filter(Boolean).join(' · ');
        button.appendChild(meta);
    }

    return button;
}

export async function initTagAutocomplete(textareas, options = {}) {
    const nodes = Array.isArray(textareas) ? textareas.filter(Boolean) : [];
    if (nodes.length === 0) {
        return null;
    }

    let initialResult;
    try {
        initialResult = await loadTagDataset(options);
    } catch (error) {
        console.warn('Unable to initialize tag autocomplete dataset:', error);
        initialResult = { dataset: [], sources: [] };
    }

    const state = {
        dataset: initialResult.dataset ?? [],
        sources: initialResult.sources ?? [],
    };

    const instances = nodes.map((textarea) => new TagAutocomplete(textarea, state.dataset));

    const applyDataset = (dataset, sources) => {
        const nextDataset = Array.isArray(dataset) ? dataset : [];
        const nextSources = Array.isArray(sources) ? sources : [];
        state.dataset = nextDataset;
        state.sources = nextSources;
        instances.forEach((instance) => instance.updateDataset(nextDataset));
        return {
            tagCount: nextDataset.length,
            sourceCount: nextSources.length,
        };
    };

    applyDataset(state.dataset, state.sources);

    const controller = {
        getDataset: () => state.dataset.slice(),
        getSources: () => state.sources.slice(),
        getStats: () => ({ tagCount: state.dataset.length, sourceCount: state.sources.length }),
        async reload(newOptions = options) {
            const result = await loadTagDataset(newOptions);
            return applyDataset(result.dataset, result.sources);
        },
        async replaceWithFiles(files) {
            const result = await loadTagDataset({ files });
            return applyDataset(result.dataset, result.sources);
        },
        async mergeFiles(files) {
            const result = await loadTagDataset({ files });
            const combined = mergeDatasets([
                { dataset: state.dataset, sources: state.sources },
                { dataset: result.dataset, sources: result.sources },
            ]);
            return applyDataset(combined.dataset, combined.sources);
        },
    };

    return controller;
}
