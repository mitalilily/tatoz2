import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Bell, Globe, Shield, LogOut, ChevronRight, Trash2, Settings as SettingsIcon } from 'lucide-react';
import Toggle from '../../components/common/Toggle';
import AccountHeader from '../../components/customer/AccountHeader';
import { updateProfile, logout } from '../../store/slices/authSlice';
import { notificationAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import SEO from '../../components/common/SEO';

const SettingsPage = () => {
 const dispatch = useDispatch();
 const navigate = useNavigate();
 const { user } = useSelector(state => state.auth);
 const [notifPrefs, setNotifPrefs] = useState(user?.notificationPrefs || { email: true, push: true, sms: false });
 const [consents, setConsents] = useState({
  transactional: { email: true, push: true, sms: true, whatsapp: true },
  marketing: { email: false, push: false, sms: false, whatsapp: false },
 });
 const [preferencesLoading, setPreferencesLoading] = useState(true);
 const [preferencesSaving, setPreferencesSaving] = useState(false);
 const [language, setLanguage] = useState(user?.language || 'en');

 useEffect(() => {
  let active = true;
  notificationAPI.getPreferences()
   .then(res => {
    if (!active) return;
    const preferences = res.data?.preferences;
    if (preferences?.channels) setNotifPrefs(current => ({ ...current, ...preferences.channels }));
    if (preferences?.purposes) setConsents(current => ({ ...current, ...preferences.purposes }));
   })
   .catch(() => {})
   .finally(() => { if (active) setPreferencesLoading(false); });
  return () => { active = false; };
 }, []);

 const saveNotifPrefs = async () => {
 setPreferencesSaving(true);
 try {
  const result = await notificationAPI.updatePreferences({ channels: notifPrefs, purposes: consents });
  if (result.data?.preferences?.channels) setNotifPrefs(current => ({ ...current, ...result.data.preferences.channels }));
  if (result.data?.preferences?.purposes) setConsents(current => ({ ...current, ...result.data.preferences.purposes }));
  // Keep the in-memory auth profile aligned with the server response for the
  // navbar and future settings visits.
  await dispatch(updateProfile({ notificationPrefs: notifPrefs }));
  toast.success('Notification preferences saved!');
 } catch (error) {
  toast.error(error.message || 'Failed to save notification preferences');
 } finally { setPreferencesSaving(false); }
 };

 const handleLogout = () => {
 dispatch(logout());
 navigate('/');
 };

 const ToggleRow = ({ checked, onChange, label, desc }) => (
 <div className="flex items-center justify-between gap-4 py-3">
 <div className="min-w-0">
 <p className="font-medium text-gray-800 text-sm">{label}</p>
 {desc && <p className="text-xs text-gray-500">{desc}</p>}
 </div>
 <div className="shrink-0"><Toggle checked={checked} onChange={onChange} aria-label={label} /></div>
 </div>
 );

 return (
 <>
 <SEO title="Account Settings" noindex={true} />
 <div className="page-container account-wrap-narrow py-6 sm:py-8">
 <AccountHeader kicker="Preferences" title="Settings" sub="Notifications, language, privacy and account actions." icon={<SettingsIcon size={20} />} accent="slate" />

 {/* Notifications */}
 <div className="card p-4 sm:p-6 mb-4" data-testid="notification-preferences">
 <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Bell size={18} className="text-primary-600" />Notifications</h3>
 {preferencesLoading ? <p className="text-sm text-gray-500">Loading your notification controls…</p> : null}
 <div className="divide-y divide-gray-100">
 <ToggleRow checked={notifPrefs.email} onChange={() => setNotifPrefs(p => ({ ...p, email: !p.email }))} label="Email Notifications" desc="Receive order updates and offers via email" />
 <ToggleRow checked={notifPrefs.push} onChange={() => setNotifPrefs(p => ({ ...p, push: !p.push }))} label="Push Notifications" desc="Real-time alerts on your device" />
 <ToggleRow checked={notifPrefs.sms} onChange={() => setNotifPrefs(p => ({ ...p, sms: !p.sms }))} label="SMS Notifications" desc="Order updates via text message" />
 </div>
 <div className="mt-5 border-t border-gray-100 pt-4 space-y-3" data-testid="notification-consent-matrix">
  <div>
   <p className="text-sm font-semibold text-gray-800">Store consent by purpose</p>
   <p className="text-xs text-gray-500 mt-1">Transactional updates are separate from optional marketing messages.</p>
  </div>
  {['transactional', 'marketing'].map(purpose => (
   <div key={purpose} className="rounded-xl border border-gray-100 p-3">
    <p className="text-xs font-bold uppercase tracking-wide text-gray-600 mb-2">{purpose}</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
     {['email', 'push', 'sms', 'whatsapp'].map(channel => (
      <label key={channel} className="flex items-center gap-2 text-xs text-gray-600">
       <input
        type="checkbox"
        checked={Boolean(consents[purpose]?.[channel])}
        onChange={event => setConsents(current => ({ ...current, [purpose]: { ...current[purpose], [channel]: event.target.checked } }))}
        data-testid={`consent-${purpose}-${channel}`}
       />
       {channel}
      </label>
     ))}
    </div>
   </div>
  ))}
 </div>
 <button onClick={saveNotifPrefs} disabled={preferencesLoading || preferencesSaving} data-testid="notification-preferences-save" className="btn-primary w-full text-sm py-2.5 mt-4 sm:w-auto">
  {preferencesSaving ? 'Saving…' : 'Save Preferences'}
 </button>
 </div>

 {/* Language */}
 <div className="card p-4 sm:p-6 mb-4">
 <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Globe size={18} className="text-primary-600" />Language</h3>
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
 <select value={language} onChange={e => setLanguage(e.target.value)} className="input w-full py-2.5 text-sm sm:w-auto sm:max-w-xs">
 <option value="en">English</option>
 <option value="hi">Hindi</option>
 <option value="ta">Tamil</option>
 <option value="te">Telugu</option>
 </select>
 <button onClick={() => { dispatch(updateProfile({ language })); toast.success('Language updated!'); }}
 className="btn-primary w-full text-sm py-2.5 sm:w-auto">Save</button>
 </div>
 </div>

 {/* Privacy */}
 <div className="card p-4 sm:p-6 mb-4">
 <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Shield size={18} className="text-primary-600" />Privacy & Security</h3>
 <div className="space-y-2">
 {[
 { label: 'Privacy Policy', link: '/privacy' },
 { label: 'Terms of Service', link: '/terms' },
 { label: 'Data & Cookies', link: '/cookies' },
 ].map(({ label, link }) => (
 <a key={label} href={link} className="flex items-center justify-between py-3 hover:bg-gray-50 rounded-xl px-3 transition-colors group">
 <span className="text-sm font-medium text-gray-700">{label}</span>
 <ChevronRight size={16} className="text-gray-400 group-hover:text-gray-600" />
 </a>
 ))}
 </div>
 </div>

 {/* Account Actions */}
 <div className="card p-4 sm:p-6">
 <h3 className="font-bold text-gray-900 mb-4">Account</h3>
 <div className="space-y-2">
 <button onClick={handleLogout} className="flex items-center justify-between w-full py-3 px-3 hover:bg-red-50 rounded-xl transition-colors group text-left">
 <div className="flex items-center gap-3">
 <LogOut size={16} className="text-red-500" />
 <span className="text-sm font-medium text-red-600">Logout</span>
 </div>
 <ChevronRight size={16} className="text-red-300" />
 </button>
 <button className="flex items-center justify-between w-full py-3 px-3 hover:bg-red-50 rounded-xl transition-colors group text-left opacity-60">
 <div className="flex items-center gap-3">
 <Trash2 size={16} className="text-red-500" />
 <span className="text-sm font-medium text-red-600">Delete Account</span>
 </div>
 <ChevronRight size={16} className="text-red-300" />
 </button>
 </div>
 </div>
 </div>
 </>
 );
};

export default SettingsPage;
