import { useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const sizeClasses = {
 sm: 'max-w-sm',
 md: 'max-w-md',
 lg: 'max-w-lg',
 xl: 'max-w-2xl',
};

/**
 * Modal – accessible, portal-based modal dialog.
 *
 * Props
 * -----
 * isOpen bool Controls visibility.
 * onClose func Called when the user closes the modal.
 * title string Rendered in the header.
 * children node Modal body content.
 * size 'sm'|'md'|'lg'|'xl' (default: 'md')
 * hideCloseBtn bool Hide the × button when true.
 * className string Extra classes for the panel.
 * drawer bool Render a full-height right-side panel instead of a centered modal.
 * wide bool Widen a drawer panel (3xl instead of xl) for content-rich panels.
 * testId string Optional test id for the panel element.
 */
const Modal = ({
 isOpen,
 onClose,
 title,
 children,
 size = 'md',
 hideCloseBtn = false,
 className = '',
 drawer = false,
 wide = false,
 testId,
}) => {
 const panelRef = useRef(null);
 const previouslyFocused = useRef(null);
 const didFocusPanel = useRef(false);

 // Trap focus inside the modal while open
 const handleKeyDown = useCallback(
 (e) => {
 if (!isOpen) return;

 if (e.key === 'Escape') {
 onClose();
 return;
 }

 if (e.key === 'Tab') {
 const focusable = panelRef.current?.querySelectorAll(
 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
 );
 if (!focusable || focusable.length === 0) return;

 const first = focusable[0];
 const last = focusable[focusable.length - 1];

 if (e.shiftKey) {
 if (document.activeElement === first) {
 e.preventDefault();
 last.focus();
 }
 } else {
 if (document.activeElement === last) {
 e.preventDefault();
 first.focus();
 }
 }
 }
 },
 [isOpen, onClose]
 );

 // Store latest handleKeyDown in a ref so the event listener always calls the current version
 const handleKeyDownRef = useRef(handleKeyDown);
 handleKeyDownRef.current = handleKeyDown;

 useEffect(() => {
 const listener = (e) => handleKeyDownRef.current(e);

 if (isOpen) {
 previouslyFocused.current = document.activeElement;
 document.addEventListener('keydown', listener);
 document.body.style.overflow = 'hidden';

 // Move focus to the panel only when first opening (not on every re-render), so typing in inputs isn't interrupted
 if (!didFocusPanel.current) {
 didFocusPanel.current = true;
 setTimeout(() => panelRef.current?.focus(), 0);
 }
 } else {
 didFocusPanel.current = false;
 document.removeEventListener('keydown', listener);
 document.body.style.overflow = '';
 previouslyFocused.current?.focus();
 }

 return () => {
 document.removeEventListener('keydown', listener);
 document.body.style.overflow = '';
 };
 }, [isOpen]); // only re-run when isOpen changes, not on every handleKeyDown change

 if (!isOpen) return null;

 return createPortal(
 <div
 className={drawer
 ? 'fixed inset-0 z-50 flex items-stretch justify-end animate-fade-in'
 : 'fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in'}
 aria-modal="true"
 role="dialog"
 aria-labelledby={title ? 'modal-title' : undefined}
 >
 {/* Backdrop */}
 <div
 className="absolute inset-0 bg-black/50 backdrop-blur-sm"
 onClick={onClose}
 aria-hidden="true"
 />

 {/* Panel */}
 <div
 ref={panelRef}
 tabIndex={-1}
 data-testid={testId}
 className={[
 drawer
 ? `relative flex h-full max-h-screen w-full flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl outline-none animate-slide-in-right ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`
 : 'relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none animate-slide-up',
 !drawer && (sizeClasses[size] ?? sizeClasses.md),
 className,
 ].join(' ')}
 >
 {/* Header */}
 {(title || !hideCloseBtn) && (
 <div className={drawer
 ? 'flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6'
 : 'flex items-center justify-between border-b border-gray-100 px-6 py-4'}>
 {title && (
 <h2
 id="modal-title"
 className="text-lg font-semibold text-gray-900 truncate"
 >
 {title}
 </h2>
 )}
 {!hideCloseBtn && (
 <button
 onClick={onClose}
 className="ml-auto flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
 aria-label={drawer ? 'Close panel' : 'Close modal'}
 data-testid={testId ? `${testId}-close` : undefined}
 >
 <X className="w-5 h-5" />
 </button>
 )}
 </div>
 )}

 {/* Body */}
 <div data-testid={testId ? `${testId}-scroll` : undefined} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">{children}</div>
 </div>
 </div>,
 document.body
 );
};

export default Modal;
