const Page = require('../models/Page');
const { validateLayout } = require('../models/sectionSchemas');
const { repairPageBuilderDefaults } = require('../utils/repairPageBuilderDefaults');

describe('page builder layout contract', () => {
  test('repair recovers corrupt defaults without replacing edits, legitimate zero opacity or mobile content', () => {
    const corrupt = { id: 'edited', data: { heading: 'User edit' }, settings: { typography: { fontFamily: 'inherit', fontSize: 8, lineHeight: 0.8, letterSpacing: 0, fontWeight: null }, media: { opacity: 0 } } };
    const page = { draftLayout: { sections: [corrupt, { id: 'intentional', settings: { media: { opacity: 0 } } }] }, mobileLayout: { sections: [{ id: 'mobile-content' }] }, mobileLayoutMode: 'separate' };
    repairPageBuilderDefaults(page, { sharedLayout: true });
    expect(page.draftLayout.sections[0].data.heading).toBe('User edit');
    expect(page.draftLayout.sections[0].settings.media.opacity).toBeNull();
    expect(page.draftLayout.sections[1].settings.media.opacity).toBe(0);
    expect(page.mobileLayout.sections[0].id).toBe('mobile-content');
    expect(page.mobileLayoutMode).toBe('auto');
    expect(repairPageBuilderDefaults(page, { sharedLayout: true })).toEqual([]);
  });
  test('empty media and typography stay inherited over repeated saves', () => {
    let layout = { sections: [{ id: 'inherit', type: 'imageBanner', settings: {
      media: { opacity: null, width: { value: null, unit: 'px' } },
      typography: { fontSize: null, lineHeight: null, letterSpacing: null, fontWeight: null },
    } }] };
    const first = validateLayout(layout);
    for (let i = 0; i < 5; i += 1) layout = validateLayout(layout);
    expect(layout).toEqual(first);
    expect(layout.sections[0].settings.media.opacity).toBeNull();
    expect(layout.sections[0].settings.media.width).toBeNull();
    expect(layout.sections[0].settings.typography).toEqual({ fontFamily: 'inherit', fontSize: null, lineHeight: null, letterSpacing: null, fontWeight: null });
  });

  test('deliberate zero opacity, zero spacing and negative letter spacing survive', () => {
    const section = validateLayout({ sections: [{ id: 'zero', type: 'mosaic', data: { gap: 0, rowGap: 0, columnGap: 0 }, settings: { media: { opacity: 0 }, padding: { all: 0 }, typography: { letterSpacing: -1.5 } } }] }).sections[0];
    expect(section.settings.media.opacity).toBe(0);
    expect(section.settings.padding.all).toBe(0);
    expect(section.settings.typography.letterSpacing).toBe(-1.5);
    expect(section.data).toMatchObject({ gap: 0, rowGap: 0, columnGap: 0 });
  });

  test('responsive nested settings remain sparse, including null resets', () => {
    const section = validateLayout({ sections: [{ id: 'sparse', type: 'mosaic',
      settings: { typography: { fontSize: 28, fontFamily: 'serif', lineHeight: 1.5 } },
      responsiveOverrides: { tabletSettings: { typography: { fontSize: 24 } }, mobileSettings: { typography: { fontSize: null }, media: { objectFit: 'contain' }, schedule: { from: '2026-09-01T00:00:00.000Z' } } },
    }] }).sections[0];
    expect(section.responsiveOverrides.tabletSettings.typography).toEqual({ fontSize: 24 });
    expect(section.responsiveOverrides.mobileSettings.typography).toEqual({ fontSize: null });
    expect(section.responsiveOverrides.mobileSettings.media).toEqual({ objectFit: 'contain' });
    expect(Object.keys(section.responsiveOverrides.mobileSettings.schedule)).toEqual(['from']);
  });

  test.each(['1+2', 'L', 'T', '2x2'])('mosaic %s preserves all grid and tile controls across storage', preset => {
    const data = { preset, gap: 7, rowGap: 0, columnGap: 12, layoutMode: 'preserve', height: null, aspectRatio: '3/2', borderRadius: 0, tiles: [{ imageUrl: '/uploads/art.png', altText: 'Art', objectFit: 'contain', objectPosition: 'top center' }] };
    const normalized = validateLayout({ sections: [{ id: preset, type: 'mosaic', data }] });
    expect(normalized.sections[0].data).toMatchObject(data);
    expect(validateLayout(normalized)).toEqual(normalized);
  });

  test.each(['cardGrid', 'imageGallery', 'productsShowcase', 'categoriesShowcase', 'uspRow', 'stats', 'testimonials', 'blogPosts'])('%s persists explicit columns and row/column gaps', type => {
    const section = validateLayout({ sections: [{ id: type, type, data: { columns: 5, gap: 0, rowGap: 11, columnGap: 3 }, responsiveOverrides: { mobile: { columns: 2, gap: 4 } } }] }).sections[0];
    expect(section.data).toMatchObject({ columns: 5, gap: 0, rowGap: 11, columnGap: 3 });
    expect(section.responsiveOverrides.mobile).toEqual({ columns: 2, gap: 4 });
  });

  test('duplicate section ids and oversized overrides fail instead of silently losing edits', () => {
    expect(() => validateLayout({ sections: [{ id: 'same', type: 'spacer' }, { id: 'same', type: 'spacer' }] })).toThrow(/unique/);
    expect(() => validateLayout({ sections: [{ id: 'large', type: 'richText', responsiveOverrides: { mobile: { html: 'x'.repeat(21000) } } }] })).toThrow(/too large/);
  });
  test('persists universal geometry and responsive media settings safely', () => {
    const layout = validateLayout({
      sections: [{
        id: 'hero-1',
        type: 'imageBanner',
        data: { imageUrl: '/uploads/banner.jpg', aspectRatio: 'wide' },
        settings: {
          width: '82%',
          height: { value: 640, unit: 'px' },
          minHeight: 240,
          sectionAlign: 'right',
          media: {
            width: { value: 90, unit: '%' },
            height: '420px',
            objectFit: 'contain',
            aspectRatio: '16/9',
            opacity: 0.65,
          },
        },
        responsiveOverrides: {
          tablet: { aspectRatio: 'square' },
          mobile: { aspectRatio: 'banner' },
          tabletSettings: { width: '100%', media: { height: '260px', align: 'left' } },
          mobileSettings: { width: { value: 100, unit: '%' }, media: { objectFit: 'cover' } },
        },
      }],
    });

    const section = layout.sections[0];
    expect(section.settings.width).toEqual({ value: 82, unit: '%' });
    expect(section.settings.media.height).toEqual({ value: 420, unit: 'px' });
    expect(section.responsiveOverrides.tabletSettings.width).toEqual({ value: 100, unit: '%' });
    expect(section.responsiveOverrides.tabletSettings.media).toEqual({ height: { value: 260, unit: 'px' }, align: 'left' });
    expect(section.responsiveOverrides.mobileSettings.media.objectFit).toBe('cover');
  });

  test('clamps unsafe dimensions and normalizes anchors/classes', () => {
    const section = validateLayout({
      sections: [{
        id: 'safe-1',
        type: 'spacer',
        settings: {
          width: { value: 999999, unit: 'vw' },
          height: 'javascript:alert(1)',
          zIndex: 99999,
          anchorId: '  Featured / Sale!  ',
          customClass: 'campaign-card !important; [bad]',
          media: { opacity: 4, aspectRatio: '999/1', objectFit: 'not-a-fit' },
        },
      }],
    }).sections[0];

    expect(section.settings.width).toEqual({ value: 4000, unit: 'vw' });
    expect(section.settings.height).toBeNull();
    expect(section.settings.zIndex).toBe(1000);
    expect(section.settings.anchorId).toBe('featured-sale');
    expect(section.settings.customClass).toBe('campaign-card important bad');
    expect(section.settings.media.opacity).toBe(1);
    expect(section.settings.media.aspectRatio).toBe('auto');
    expect(section.settings.media.objectFit).toBeNull();
  });

  test('declares every responsive storage key in the Mongoose section schema', () => {
    const sectionSchema = Page.schema.path('draftLayout').schema.path('sections').schema;
    expect(sectionSchema.path('responsiveOverrides.tablet')).toBeTruthy();
    expect(sectionSchema.path('responsiveOverrides.mobile')).toBeTruthy();
    expect(sectionSchema.path('responsiveOverrides.tabletSettings')).toBeTruthy();
    expect(sectionSchema.path('responsiveOverrides.mobileSettings')).toBeTruthy();
  });
});
