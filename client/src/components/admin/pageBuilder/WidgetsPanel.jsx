import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Eye, EyeOff, Copy, Trash2,
  Layout, Grid, Type, Image, Video, Mail, Clock, Star, MessageSquare,
  Shield, MapPin, Code, Columns, Box, Play, Hash, MessageCircle,
  Percent, ShoppingCart, Headphones, FileText, AlignLeft, Bell, Truck, CreditCard, Package, Ruler, RefreshCw, Zap, ArrowUp,
  Plus, ListTree, CheckSquare, Search
} from 'lucide-react';
import { selectSection, toggleSectionSelection, removeSection, removeSelectedSections, duplicateSection, moveSection, toggleSectionVisibility, toggleSelectedSectionsVisibility, setEditingMobileLayout, selectActiveSections, addSection } from '../../../store/slices/pageBuilderSlice';
import { SECTION_REGISTRY } from '../../sections/registry';
import { getResponsiveSettings } from '../../page/responsive';

const WIDGET_ICONS = {
  hero: Layout,
  announcementBar: Bell,
  imageBanner: Image,
  cardGrid: Grid,
  mosaic: Layout,
  tabs: Columns,
  spacer: Box,
  productsShowcase: ShoppingCart,
  categoriesShowcase: Grid,
  brandStrip: Star,
  imageText: Type,
  richText: AlignLeft,
  uspRow: Shield,
  buttons: Layout,
  faq: MessageSquare,
  stats: Hash,
  testimonials: Star,
  newsletter: Mail,
  trustBadges: Shield,
  countdown: Clock,
  couponCta: Percent,
  shippingBar: Truck,
  video: Play,
  imageGallery: Image,
  socialEmbed: Headphones,
  blogPosts: FileText,
  map: MapPin,
  customHtml: Code,
  paymentIcons: CreditCard,
  stockCounter: Package,
  sizeGuide: Ruler,
  returnPolicy: RefreshCw,
  contactCta: MessageCircle,
  flashSaleBanner: Zap,
  backToTop: ArrowUp,
};

const CATEGORY_ORDER = ['Hero', 'Layout', 'Commerce', 'Content', 'Social Proof', 'Conversion', 'Media', 'Other'];

function TabBar({ activeTab, onChange }) {
  const tabs = [
    { id: 'add', label: 'Add Widget', Icon: Plus },
    { id: 'tree', label: 'Widget Tree', Icon: ListTree },
  ];
  return (
    <div className="flex border-b border-gray-200 flex-shrink-0 bg-white">
      {tabs.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            data-testid={`page-builder-${id}-tab`}
            onClick={() => onChange(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function WidgetCatalogGrid() {
  const dispatch = useDispatch();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const groupedSections = CATEGORY_ORDER.reduce((acc, category) => {
    const items = Object.entries(SECTION_REGISTRY)
      .filter(([_, entry]) => entry.category === category)
      .filter(([type, entry]) => !normalizedQuery || [type, entry.label, entry.category].some(value => String(value || '').toLowerCase().includes(normalizedQuery)))
      .map(([type, entry]) => ({ type, ...entry }));
    if (items.length > 0) {
      acc[category] = items;
    }
    return acc;
  }, {});

  const handleAddWidget = (type) => {
    dispatch(addSection(type));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="sticky top-0 z-10 px-2 pt-2 pb-2 bg-white border-b border-gray-100">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            data-testid="page-builder-widget-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search widgets…"
            aria-label="Search widgets"
            className="w-full h-8 pl-8 pr-2 border border-gray-200 rounded-lg text-[11px] text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>
      <div className="px-2 pt-2 pb-2 space-y-2.5">
        {Object.entries(groupedSections).map(([category, items]) => (
          <div key={category}>
            <div className="flex items-center gap-1.5 px-1 mb-1">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{category}</span>
              <span className="text-[10px] text-gray-300">·</span>
              <span className="text-[10px] text-gray-300">{items.length}</span>
            </div>
            <div className="space-y-0.5">
              {items.map(item => {
                const IconComponent = WIDGET_ICONS[item.type] || Box;
                return (
                  <button
                    key={item.type}
                    data-testid={`page-builder-add-${item.type}`}
                    onClick={() => handleAddWidget(item.type)}
                    className="group w-full flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-indigo-50 active:bg-indigo-100 transition text-left"
                  >
                    <div className="w-6 h-6 rounded bg-gray-100 group-hover:bg-white group-hover:ring-1 group-hover:ring-indigo-200 flex items-center justify-center flex-shrink-0 transition">
                      <IconComponent size={13} className="text-gray-500 group-hover:text-indigo-600 transition" />
                    </div>
                    <span className="text-[11px] text-gray-700 group-hover:text-indigo-700 font-medium truncate flex-1 transition">{item.label}</span>
                    <Plus size={11} className="text-gray-300 group-hover:text-indigo-500 flex-shrink-0 transition" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {Object.keys(groupedSections).length === 0 && (
          <div className="px-2 py-8 text-center text-[11px] leading-4 text-gray-400">No widgets match “{query}”.</div>
        )}
      </div>
    </div>
  );
}

function Row({ section }) {
  const dispatch = useDispatch();
  const selected = useSelector(s => s.pageBuilder.selectedSectionId === section.id);
  const multiSelected = useSelector(s => (s.pageBuilder.selectedSectionIds || []).includes(section.id));
  const { attributes: rowAttrs, listeners: rowListeners, setNodeRef: rowRef, transform: rowTransform, transition: rowTransition, isDragging: rowDragging } = useSortable({ id: section.id });
  const rowStyle = { transform: CSS.Transform.toString(rowTransform), transition: rowTransition, opacity: rowDragging ? 0.4 : 1 };
  const label = SECTION_REGISTRY[section.type]?.label || section.type;
  const device = useSelector(s => s.pageBuilder.device);
  const editingMobileLayout = useSelector(s => s.pageBuilder.editingMobileLayout);
  const visibleSettings = editingMobileLayout ? (section.settings || {}) : getResponsiveSettings(section, device);
  const isHidden = visibleSettings.visibility === 'hidden';
  return (
    <div ref={rowRef} style={rowStyle} className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] ${selected ? 'bg-indigo-50 border-indigo-200' : multiSelected ? 'bg-indigo-50/60 border-indigo-100' : 'bg-white border-gray-100 hover:bg-gray-50'}`} onClick={event => dispatch(event.metaKey || event.ctrlKey ? toggleSectionSelection(section.id) : selectSection(section.id))}>
      <button aria-label={`Move ${label}`} data-testid={`page-builder-drag-${section.id}`} {...rowAttrs} {...rowListeners} className="text-gray-400 hover:text-gray-600 cursor-grab p-0.5"><GripVertical size={11} /></button>
      <label className="flex items-center justify-center p-0.5 cursor-pointer" title="Select for reusable block" onClick={event => event.stopPropagation()}>
        <input data-testid={`page-builder-select-section-${section.id}`} type="checkbox" checked={multiSelected} onChange={() => dispatch(toggleSectionSelection(section.id))} className="sr-only" />
        <CheckSquare size={12} className={multiSelected ? 'text-indigo-600' : 'text-gray-300'} />
      </label>
      <span className={`flex-1 truncate ${isHidden ? 'text-gray-400 italic' : 'text-gray-700'}`}>{label}</span>
      <button onClick={e => { e.stopPropagation(); dispatch(toggleSectionVisibility(section.id)); }} className="text-gray-400 hover:text-gray-700 p-0.5">{isHidden ? <EyeOff size={11} /> : <Eye size={11} />}</button>
      <button onClick={e => { e.stopPropagation(); dispatch(duplicateSection(section.id)); }} className="text-gray-400 hover:text-gray-700 p-0.5"><Copy size={11} /></button>
      <button onClick={e => { e.stopPropagation(); if (confirm('Delete?')) dispatch(removeSection(section.id)); }} className="text-gray-400 hover:text-red-600 p-0.5"><Trash2 size={11} /></button>
    </div>
  );
}

function DraggableSection() {
  const dispatch = useDispatch();
  const sections = useSelector(selectActiveSections);
  const selectedIds = useSelector(s => s.pageBuilder.selectedSectionIds || []);
  const device = useSelector(s => s.pageBuilder.device);
  const editingMobileLayout = useSelector(s => s.pageBuilder.editingMobileLayout);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const selectedVisible = sections.filter(section => selectedIds.includes(section.id)).some(section => {
    const settings = editingMobileLayout ? (section.settings || {}) : getResponsiveSettings(section, device);
    return settings.visibility !== 'hidden';
  });


  const handleDragEnd = (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fromIndex = sections.findIndex(s => s.id === active.id);
    const toIndex = sections.findIndex(s => s.id === over.id);
    if (fromIndex !== -1 && toIndex !== -1) {
      dispatch(moveSection({ fromIndex, toIndex }));
    }
  };


  return (
    <div className="flex-1 flex flex-col min-h-0">
      {selectedIds.length > 0 && (
        <div className="sticky top-0 z-10 mx-2 mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-2 shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-[10px] font-semibold text-indigo-800">{selectedIds.length} selected</span>
            <button type="button" onClick={() => dispatch(toggleSelectedSectionsVisibility())} className="rounded px-1.5 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-white" title={selectedVisible ? 'Hide selected widgets' : 'Show selected widgets'}>
              {selectedVisible ? 'Hide' : 'Show'}
            </button>
            <button type="button" onClick={() => { if (confirm(`Delete ${selectedIds.length} selected widgets?`)) dispatch(removeSelectedSections()); }} className="rounded px-1.5 py-1 text-[10px] font-semibold text-red-600 hover:bg-white" title="Delete selected widgets">Delete</button>
            <button type="button" onClick={() => dispatch(selectSection(null))} className="rounded px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-white" title="Clear selection">Clear</button>
          </div>
        </div>
      )}
      <div data-testid="page-builder-widget-tree" className="flex-1 overflow-y-auto px-2 py-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
            {sections.length === 0 ? (
              <div className="text-[10px] text-gray-400 text-center py-3">No widgets yet</div>
            ) : (
              sections.map(s => <Row key={s.id} section={s} />)
            )}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

export default function WidgetsPanel() {
  const isSeparate = useSelector(s => s.pageBuilder.page?.mobileLayoutMode === 'separate');
  const editingMobile = useSelector(s => s.pageBuilder.editingMobileLayout);
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState('add');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TabBar activeTab={activeTab} onChange={setActiveTab} />

      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'add' ? <WidgetCatalogGrid /> : <DraggableSection />}
      </div>

      {/* Mobile/Desktop Layout Toggle */}
      {isSeparate && (
        <div className="px-2 py-2 flex gap-1 border-t border-gray-200 flex-shrink-0">
          <button onClick={() => dispatch(setEditingMobileLayout(false))} className={`flex-1 text-xs py-1.5 rounded ${!editingMobile ? 'bg-indigo-600 text-white font-semibold' : 'bg-gray-100 text-gray-700'}`}>Desktop</button>
          <button onClick={() => dispatch(setEditingMobileLayout(true))} className={`flex-1 text-xs py-1.5 rounded ${editingMobile ? 'bg-indigo-600 text-white font-semibold' : 'bg-gray-100 text-gray-700'}`}>Mobile</button>
        </div>
      )}
    </div>
  );
}
