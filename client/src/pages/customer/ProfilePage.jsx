import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { User, Mail, Phone, MapPin, Plus, Edit3, Trash2, Check, X } from 'lucide-react';
import { updateProfile, changePhone } from '../../store/slices/authSlice';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';
import Loader from '../../components/common/Loader';
import SEO from '../../components/common/SEO';
import AccountHeader from '../../components/customer/AccountHeader';

const ProfilePage = () => {
 const dispatch = useDispatch();
 const { user, loading } = useSelector(state => state.auth);
 const [editing, setEditing] = useState(false);
 const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '' });
 useEffect(() => setForm({ name: user?.name || '', email: user?.email || '' }), [user?.name, user?.email]);
 const [addingAddress, setAddingAddress] = useState(false);
 const [newAddress, setNewAddress] = useState({ label: 'Home', fullName: '', phone: '', street: '', city: '', state: '', pincode: '', country: 'India', isDefault: false });

 const [phoneModal, setPhoneModal] = useState(false);
 const [newPhone, setNewPhone] = useState('');
 const [phoneOtp, setPhoneOtp] = useState('');
 const [phoneStep, setPhoneStep] = useState('enter'); // 'enter' | 'verify'
 const [phoneBusy, setPhoneBusy] = useState(false);

 const resetPhoneFlow = () => {
   setPhoneModal(false);
   setNewPhone('');
   setPhoneOtp('');
   setPhoneStep('enter');
   setPhoneBusy(false);
 };

 const handleSendPhoneOtp = async () => {
   const digits = newPhone.replace(/\D/g, '');
   if (digits.length < 10) { toast.error('Enter a valid 10-digit number'); return; }
   setPhoneBusy(true);
   try {
     await authAPI.changePhoneSendOtp(digits);
     toast.success('OTP sent to new number');
     setPhoneStep('verify');
   } catch (err) {
     toast.error(err.message || 'Failed to send OTP');
   } finally {
     setPhoneBusy(false);
   }
 };

 const handleVerifyPhoneOtp = async () => {
   if (phoneOtp.length < 4) { toast.error('Enter the OTP'); return; }
   setPhoneBusy(true);
   const digits = newPhone.replace(/\D/g, '');
   const result = await dispatch(changePhone({ phone: digits, otp: phoneOtp }));
   setPhoneBusy(false);
   if (result.meta.requestStatus === 'fulfilled') resetPhoneFlow();
 };

 const handleSaveProfile = async () => {
 const result = await dispatch(updateProfile({ name: form.name, email: form.email }));
 if (result.meta.requestStatus === 'fulfilled') setEditing(false);
 };

 const handleAddAddress = async () => {
 try {
 await authAPI.addAddress(newAddress);
 toast.success('Address added!');
 setAddingAddress(false);
 window.location.reload();
 } catch (err) { toast.error(err.message); }
 };


 if (!user) {
 return (
 <div className="page-container py-8 flex items-center justify-center min-h-[40vh]">
 <Loader size="md" />
 </div>
 );
 }

 return (
 <>
 <SEO title="My Profile" noindex={true} />
 <div className="page-container account-wrap py-6 sm:py-8">
 <AccountHeader kicker="Account settings" title="My Profile" sub="Your details, addresses and account overview." icon={<User size={20} />} accent="slate" />

 <div className="grid min-w-0 gap-4 sm:gap-6 md:grid-cols-3">
 {/* Profile Card */}
 <div className="min-w-0 space-y-4 sm:space-y-5 md:col-span-2">
 <div className="card p-4 sm:p-6">
 <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
 <div className="flex min-w-0 items-center gap-3 sm:gap-4">
 <div className="h-16 w-16 shrink-0 rounded-2xl bg-slate-900 flex items-center justify-center text-white text-2xl font-black">
 {user?.name?.charAt(0)}
 </div>
 <div className="min-w-0">
 <h2 className="break-anywhere text-xl font-bold text-gray-900">{user?.name}</h2>
 <p className="text-gray-500 text-sm break-anywhere">{user?.email}</p>
 <span className="badge bg-primary-100 text-primary-700 text-xs mt-1 capitalize">{user?.role}</span>
 </div>
 </div>
 <button onClick={() => setEditing(!editing)} className={`flex shrink-0 items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-colors ${editing ? 'bg-gray-100 text-gray-600' : 'bg-primary-50 text-primary-600 hover:bg-primary-100'}`}>
 <Edit3 size={14} />{editing ? 'Cancel' : 'Edit'}
 </button>
 </div>

 {editing ? (
 <div className="space-y-3">
 <div>
 <label className="text-xs font-medium text-gray-600 mb-1 block">Full Name</label>
 <div className="relative">
 <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
 className="input pl-9 py-2.5 text-sm" />
 </div>
 </div>
 <div>
 <label className="text-xs font-medium text-gray-600 mb-1 block">Email</label>
 <div className="relative">
 <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
 className="input pl-9 py-2.5 text-sm" placeholder="you@example.com" />
 </div>
 </div>
 <p className="text-xs text-gray-500">To change your phone number, use the Change button in the phone field below.</p>
 <button onClick={handleSaveProfile} disabled={loading} className="btn-primary text-sm py-2.5 flex items-center gap-2">
 {loading ? <Loader size="sm" /> : <><Check size={16} />Save Changes</>}
 </button>
 </div>
 ) : (
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
 <div className="flex min-w-0 items-start gap-3 bg-gray-50 rounded-xl p-3">
 <User size={16} className="text-primary-600 mt-0.5" />
 <div className="min-w-0">
 <p className="text-xs text-gray-500">Full Name</p>
 <p className="text-sm font-medium text-gray-800">{user?.name || 'Not set'}</p>
 </div>
 </div>
 <div className="flex min-w-0 items-start gap-3 bg-gray-50 rounded-xl p-3">
 <Mail size={16} className="text-primary-600 mt-0.5" />
 <div className="min-w-0">
 <p className="text-xs text-gray-500">Email</p>
 <p className="text-sm font-medium text-gray-800">{user?.email || 'Not set'}</p>
 </div>
 </div>
 <div className="flex min-w-0 items-start gap-3 bg-gray-50 rounded-xl p-3 sm:col-span-2">
 <Phone size={16} className="text-primary-600 mt-0.5" />
 <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
 <div className="min-w-0">
 <p className="text-xs text-gray-500">Phone</p>
 <p className="text-sm font-medium text-gray-800">{user?.phone || 'Not set'}</p>
 </div>
 <button onClick={() => setPhoneModal(true)} className="text-xs font-medium text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 transition-colors">
 {user?.phone ? 'Change' : 'Add'}
 </button>
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Addresses */}
 <div className="card p-4 sm:p-6">
 <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
 <h3 className="min-w-0 font-bold text-gray-900 flex items-center gap-2"><MapPin size={18} className="text-primary-600 shrink-0" />Saved Addresses</h3>
 <button onClick={() => setAddingAddress(true)} className="shrink-0 text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1 font-medium">
 <Plus size={14} />Add New
 </button>
 </div>

 {(user?.addresses?.length ?? 0) === 0 ? (
 <p className="text-gray-500 text-sm">No addresses saved yet.</p>
 ) : (
 <div className="grid gap-2 sm:grid-cols-2">
 {(user?.addresses || []).map((addr, i) => (
 <div key={i} className={`p-4 rounded-xl border transition-colors ${addr.isDefault ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white'}`}>
 <div className="flex flex-wrap justify-between gap-2">
 <span className="badge bg-gray-100 text-gray-700 text-xs">{addr.label}</span>
 {addr.isDefault && <span className="badge bg-primary-100 text-primary-700 text-xs">Default</span>}
 </div>
 <p className="font-semibold text-gray-800 mt-2">{addr.fullName}</p>
 <p className="text-sm text-gray-600 break-anywhere">{addr.street}, {addr.city}, {addr.state} {addr.pincode}</p>
 <p className="text-sm text-gray-500">{addr.phone}</p>
 </div>
 ))}
 </div>
 )}

 {addingAddress && (
 <div className="mt-4 grid grid-cols-1 gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200 sm:grid-cols-2">
 <h4 className="font-semibold text-gray-800 sm:col-span-2">New Address</h4>
 {[
 { key: 'fullName', label: 'Full Name', cols: 'sm:col-span-2' },
 { key: 'phone', label: 'Phone', type: 'tel' },
 { key: 'label', label: 'Label (Home/Office)' },
 { key: 'street', label: 'Street Address', cols: 'sm:col-span-2' },
 { key: 'city', label: 'City' },
 { key: 'state', label: 'State' },
 { key: 'pincode', label: 'Pincode' },
 ].map(({ key, label, cols, type }) => (
 <div key={key} className={cols || ''}>
 <input type={type || 'text'} value={newAddress[key]} onChange={e => setNewAddress(a => ({ ...a, [key]: e.target.value }))}
 className="input py-2 text-sm w-full" placeholder={label} />
 </div>
 ))}
 <label className="flex items-start gap-2 text-sm text-gray-700 sm:col-span-2">
 <input type="checkbox" checked={newAddress.isDefault} onChange={e => setNewAddress(a => ({ ...a, isDefault: e.target.checked }))} />
 Set as default address
 </label>
 <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
 <button onClick={handleAddAddress} className="btn-primary w-full text-sm py-2 sm:w-auto">Save Address</button>
 <button onClick={() => setAddingAddress(false)} className="btn-secondary w-full text-sm py-2 sm:w-auto">Cancel</button>
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Sidebar */}
 <div className="space-y-4">
 {/* Account Stats */}
 <div className="card p-4 sm:p-5">
 <h3 className="font-bold text-gray-900 mb-4">Account Overview</h3>
 <div className="space-y-3">
 {[
 { label: 'Member Since', value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'N/A' },
 { label: 'Wishlist Items', value: user?.wishlist?.length || 0 },
 { label: 'Addresses', value: user?.addresses?.length || 0 },
 ].map(({ label, value }) => (
 <div key={label} className="flex justify-between text-sm">
 <span className="text-gray-500">{label}</span>
 <span className="font-semibold text-gray-800">{value}</span>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>

 {phoneModal && (
 <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4" onClick={resetPhoneFlow}>
 <div className="my-3 max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:my-0 sm:max-h-[calc(100dvh-2rem)] sm:p-6" onClick={e => e.stopPropagation()}>
 <div className="flex items-center justify-between mb-5">
 <h3 className="text-lg font-bold text-gray-900">
 {phoneStep === 'enter' ? 'Change Phone Number' : 'Verify OTP'}
 </h3>
 <button onClick={resetPhoneFlow} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
 </div>
 {phoneStep === 'enter' ? (
 <div className="space-y-4">
 <p className="text-sm text-gray-600">We'll send a one-time code to verify your new phone number.</p>
 <div>
 <label className="text-xs font-medium text-gray-600 mb-1 block">New phone number</label>
 <input
 type="tel"
 inputMode="numeric"
 value={newPhone}
 onChange={e => setNewPhone(e.target.value)}
 placeholder="10-digit mobile number"
 className="input py-2.5 text-sm w-full"
 autoFocus
 />
 </div>
 <button onClick={handleSendPhoneOtp} disabled={phoneBusy} className="btn-primary w-full text-sm py-2.5 flex items-center justify-center gap-2">
 {phoneBusy ? <Loader size="sm" /> : 'Send OTP'}
 </button>
 </div>
 ) : (
 <div className="space-y-4">
 <p className="text-sm text-gray-600">Enter the OTP sent to <span className="font-semibold">+91 {newPhone}</span>.</p>
 <div>
 <label className="text-xs font-medium text-gray-600 mb-1 block">OTP</label>
 <input
 type="text"
 inputMode="numeric"
 value={phoneOtp}
 onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
 placeholder="6-digit code"
 className="input py-2.5 text-sm w-full tracking-widest text-center font-semibold"
 autoFocus
 maxLength={6}
 />
 </div>
 <div className="flex gap-2">
 <button onClick={() => setPhoneStep('enter')} className="btn-secondary text-sm py-2.5 flex-1">Back</button>
 <button onClick={handleVerifyPhoneOtp} disabled={phoneBusy} className="btn-primary text-sm py-2.5 flex-1 flex items-center justify-center gap-2">
 {phoneBusy ? <Loader size="sm" /> : 'Verify & Update'}
 </button>
 </div>
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 </>
 );
};

export default ProfilePage;
