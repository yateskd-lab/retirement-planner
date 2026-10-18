// @vitest-environment jsdom
// The PDF report builder, with the two PDF libraries replaced by recorders so the test
// can see exactly what would be drawn and saved.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import html2canvas from 'html2canvas-pro';
import { generatePDFReport } from './pdfReport';

const pdf = vi.hoisted(() => ({ docs: [] }));

vi.mock('jspdf', () => ({
  default: class FakePDF {
    constructor(...args) {
      this.args = args; this.texts = []; this.images = []; this.pages = 1; this.savedAs = null;
      this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
      pdf.docs.push(this);
    }
    setFontSize() {}
    setFont() {}
    text(t) { this.texts.push(t); }
    addPage() { this.pages += 1; }
    addImage(data, format, x, y, w, h) { this.images.push({ x, y, w, h, page: this.pages }); }
    save(name) { this.savedAs = name; }
  },
}));

// Each captured section reports the size given in its data-w / data-h attributes.
vi.mock('html2canvas-pro', () => ({
  default: vi.fn(async (el) => ({
    toDataURL: () => 'data:image/png;base64,AAAA',
    width: Number(el.dataset.w || 800),
    height: Number(el.dataset.h || 400),
  })),
}));

const scenarios = [{ id: 1, name: 'Base' }, { id: 2, name: 'Alt' }];
const calculateScenario = vi.fn(() => ({ totalTax: 1 }));
const page = (sections) => {
  document.body.innerHTML = sections
    .map(([cls, h = 400]) => `<div class="pdf-section ${cls}" data-w="800" data-h="${h}"></div>`).join('');
};
const build = (overrides = {}) => generatePDFReport({
  scenarios, activeScenarioId: 1, calculateScenario, pdfReportMode: 'full', ...overrides,
});
const doc = () => pdf.docs[pdf.docs.length - 1];
const today = () => new Date().toISOString().split('T')[0];

beforeEach(() => {
  pdf.docs.length = 0;
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('alert', vi.fn());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('what goes into the report', () => {
  it('full report: every section, including the detail-only ones', async () => {
    page([['a'], ['b pdf-detail-only'], ['c']]);
    await build();
    expect(html2canvas).toHaveBeenCalledTimes(3);
    expect(doc().images).toHaveLength(3);
    expect(doc().texts.join(' ')).toContain('(Full)');
  });

  it('summary report: leaves out the detail-only sections', async () => {
    page([['a'], ['b pdf-detail-only'], ['c']]);
    await build({ pdfReportMode: 'summary' });
    expect(html2canvas).toHaveBeenCalledTimes(2);
    expect(doc().images).toHaveLength(2);
    expect(doc().texts.join(' ')).toContain('(Summary)');
  });

  it('puts the scenario name and today\'s date on the title page, and the name in the file name', async () => {
    page([['a']]);
    await build({ activeScenarioId: 2 });
    expect(doc().texts).toContain('Scenario: Alt');
    expect(doc().savedAs).toBe(`retirement-tax-report-Alt-${today()}.pdf`);
  });

  it('calculates the active scenario, and falls back to the first one', async () => {
    page([['a']]);
    await build({ activeScenarioId: 2 });
    expect(calculateScenario).toHaveBeenLastCalledWith(scenarios[1]);
    await build({ activeScenarioId: 999 });
    expect(calculateScenario).toHaveBeenLastCalledWith(scenarios[0]);
    expect(doc().savedAs).toContain('-Base-');
  });

  it('uses an A4 portrait page in millimetres', async () => {
    page([['a']]);
    await build();
    expect(doc().args).toEqual(['p', 'mm', 'a4']);
  });
});

describe('layout', () => {
  it('starts a new page when the next section does not fit', async () => {
    // 800 x 600 scaled to the 180 mm text width is 135 mm tall: two fit per page, not three
    page([['a', 600], ['b', 600], ['c', 600], ['d', 600], ['e', 600]]);
    await build();
    expect(doc().pages).toBeGreaterThan(1);
    expect(doc().images.map((i) => i.page)).toEqual([...doc().images.map((i) => i.page)].sort((x, y) => x - y));
  });

  it('keeps every image above the bottom margin', async () => {
    page([['a', 500], ['b', 700], ['c', 300], ['d', 900], ['e', 400], ['f', 650]]);
    await build();
    doc().images.forEach((img) => expect(img.y + img.h).toBeLessThanOrEqual(297 - 20 + 1e-9));
  });

  it('shrinks a section taller than a whole page to fit, keeping its proportions and centring it', async () => {
    page([['tall', 3000]]);                       // 800 x 3000
    await build();
    const [img] = doc().images;
    expect(img.h).toBeLessThanOrEqual(297 - 40 + 1e-9);
    expect(img.w / img.h).toBeCloseTo(800 / 3000, 6);
    expect(img.x).toBeCloseTo((210 - img.w) / 2, 6);
  });
});

describe('when something goes wrong', () => {
  it('says so and saves nothing if there is no scenario', async () => {
    page([['a']]);
    await build({ scenarios: [] });
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('No scenario data'));
    expect(doc().savedAs).toBeNull();
    expect(html2canvas).not.toHaveBeenCalled();
  });

  it('carries on if one section cannot be captured', async () => {
    page([['a'], ['b'], ['c']]);
    html2canvas.mockRejectedValueOnce(new Error('capture failed'));
    await build();
    expect(doc().images).toHaveLength(2);
    expect(doc().savedAs).toMatch(/^retirement-tax-report-Base-/);
  });

  it('tells you, and saves nothing, when no section can be captured', async () => {
    page([['a'], ['b'], ['c']]);
    for (let i = 0; i < 3; i += 1) html2canvas.mockRejectedValueOnce(new Error('unsupported color function "oklch"'));
    await build();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('could not be built'));
    expect(doc().savedAs).toBeNull();
  });

  it('tells you when the page has no report sections at all', async () => {
    page([]);
    await build();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('could not be built'));
    expect(doc().savedAs).toBeNull();
  });

  it('shows an error message instead of throwing', async () => {
    page([['a']]);
    await expect(build({ calculateScenario: () => { throw new Error('boom'); } })).resolves.toBeUndefined();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Error generating PDF'));
  });
});
