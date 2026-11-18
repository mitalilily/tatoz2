import { SECTION_REGISTRY } from '../sections/registry';
import SectionWrapper from './SectionWrapper';
import { designSystemStyle } from './designSystem';
import { getEffectiveSection } from './responsive';

export default function PageRenderer({ layout, device = 'desktop', vendorSlug = '', designSystem = {}, selectable = false, selectedSectionId = null, onSelectSection, preview = false, applyResponsiveOverrides = true }) {
  const sections = Array.isArray(layout?.sections) ? layout.sections : [];
  return (
    <div data-page-device={device} className="page-renderer min-w-0 w-full max-w-full overflow-x-clip" style={designSystemStyle(designSystem)}>
      {sections.map(section => {
        const entry = SECTION_REGISTRY[section.type];
        if (!entry) return null; // unknown type → render nothing (forward-compat)
        const Comp = entry.component;
        const effectiveSection = applyResponsiveOverrides ? getEffectiveSection(section, device) : section;
        return (
          <SectionWrapper
            key={effectiveSection.id}
            section={effectiveSection}
            device={device}
            selectable={selectable}
            selected={selectedSectionId === effectiveSection.id}
            onSelect={() => onSelectSection?.(effectiveSection.id)}
            preview={preview}
          >
            <Comp data={effectiveSection.data} device={device} vendorSlug={vendorSlug} />
          </SectionWrapper>
        );
      })}
    </div>
  );
}
