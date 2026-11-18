/**
 * Toggle switch – consistent appearance and correct knob positioning across the app.
 * Track: 48×24px. Knob: 16×16px, vertically centered, 4px from edges when off/on.
 *
 * @param {boolean} checked – controlled state
 * @param {function} onChange – (e) => void
 * @param {string} className – extra classes on the track (e.g. dark mode)
 * @param {string} role – default 'switch' for accessibility
 */
const Toggle = ({ checked, onChange, className = '', role = 'switch', 'aria-label': ariaLabel, title, disabled = false, 'data-state': dataState }) => (
 <button
  type="button"
  role={role}
  aria-checked={checked}
  aria-label={ariaLabel}
  title={title}
  disabled={disabled}
  data-state={dataState || (checked ? 'on' : 'off')}
  onClick={onChange}
  className={`relative w-12 h-6 rounded-full flex-shrink-0 border focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-primary-600 bg-primary-600' : 'border-gray-400 bg-gray-300'} ${className}`}
 >
 <span
 className={`absolute left-0 top-1/2 w-4 h-4 rounded-full bg-white ${checked ? 'translate-x-7 -translate-y-1/2' : 'translate-x-1 -translate-y-1/2'}`}
 aria-hidden
 />
 </button>
);

export default Toggle;
