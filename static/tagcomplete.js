const DEFAULT_DATA_URL = '/tagcomplete-data.json';
const MAX_RESULTS = 20;

function normalize(str) {
    return (str ?? '').toLowerCase();
}

async function loadTagDataset(dataUrl = DEFAULT_DATA_URL) {
    try {
        const response = await fetch(dataUrl, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Failed to load tagcomplete data (${response.status})`);
        }
        const raw = await response.json();
        if (!Array.isArray(raw)) {
            throw new Error('Tagcomplete data is not an array');
        }
        return raw
            .map((item) => {
                const tag = item.tag ?? item.name;
                if (!tag) {
                    return null;
                }
                const aliases = Array.isArray(item.aliases) ? item.aliases : [];
                const synonyms = [tag, ...aliases]
                    .map((value) => normalize(value))
                    .filter((value, index, array) => value && array.indexOf(value) === index);
                return {
                    tag,
                    aliases,
                    category: item.category ?? 'general',
                    description: item.description ?? '',
                    synonyms,
                };
            })
            .filter(Boolean);
    } catch (error) {
        console.warn('Unable to load tagcomplete dataset:', error);
        return [];
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

class TagAutocomplete {
    constructor(textarea, dataset) {
        this.textarea = textarea;
        this.dataset = dataset;
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

export async function initTagAutocomplete(textareas, options = {}) {
    if (!Array.isArray(textareas) || textareas.length === 0) {
        return;
    }

    const dataset = await loadTagDataset(options.dataUrl);
    if (!dataset || dataset.length === 0) {
        return;
    }

    textareas.forEach((textarea) => {
        if (textarea) {
            // eslint-disable-next-line no-new
            new TagAutocomplete(textarea, dataset);
        }
    });
}
