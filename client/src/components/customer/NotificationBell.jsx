import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, CheckCheck, ShoppingBag, Tag, AlertCircle, Star, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { notificationAPI } from '../../services/api';

const TYPE_CONFIG = {
 order: { icon: ShoppingBag, color: 'text-blue-500', bg: 'bg-blue-50' },
 promo: { icon: Tag, color: 'text-green-500', bg: 'bg-green-50' },
 system: { icon: Megaphone, color: 'text-primary-500', bg: 'bg-primary-50' },
 alert: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50' },
 review: { icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-50' },
};

const NotificationBell = () => {
 const [open, setOpen] = useState(false);
 const [notifications, setNotifications] = useState([]);
 const [unreadCount, setUnreadCount] = useState(0);
 const [loading, setLoading] = useState(false);
 const bellRef = useRef(null);
 const dropdownRef = useRef(null);
 const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

 const fetchUnreadCount = useCallback(async () => {
 try {
 const res = await notificationAPI.getUnreadCount();
 setUnreadCount(res.data.unreadCount || 0);
 } catch {}
 }, []);

 const fetchNotifications = useCallback(async () => {
 setLoading(true);
 try {
 const res = await notificationAPI.getAll({ limit: 10 });
 setNotifications(res.data.notifications || []);
 setUnreadCount(res.data.unreadCount || 0);
 } catch {}
 finally { setLoading(false); }
 }, []);

 // Poll unread count every 30s
 useEffect(() => {
 fetchUnreadCount();
 const interval = setInterval(fetchUnreadCount, 30000);
 return () => clearInterval(interval);
 }, [fetchUnreadCount]);

 // Fetch full list when dropdown opens
 useEffect(() => {
 if (open) fetchNotifications();
 }, [open, fetchNotifications]);

 // Close on outside click
 useEffect(() => {
 const handler = (e) => {
 if (
 dropdownRef.current && !dropdownRef.current.contains(e.target) &&
 bellRef.current && !bellRef.current.contains(e.target)
 ) {
 setOpen(false);
 }
 };
 document.addEventListener('mousedown', handler);
 return () => document.removeEventListener('mousedown', handler);
 }, []);

 // Position dropdown below bell button
 useEffect(() => {
 if (open && bellRef.current) {
 const rect = bellRef.current.getBoundingClientRect();
 setDropdownPos({
 top: rect.bottom + 8,
 right: window.innerWidth - rect.right,
 });
 }
 }, [open]);

 const handleMarkRead = async (id) => {
 await notificationAPI.markAsRead(id);
 setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
 setUnreadCount(prev => Math.max(0, prev - 1));
 };

 const handleMarkAllRead = async () => {
 await notificationAPI.markAllAsRead();
 setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
 setUnreadCount(0);
 };

 const timeSince = (date) => {
 const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
 if (mins < 1) return 'Just now';
 if (mins < 60) return `${mins}m ago`;
 const hrs = Math.floor(mins / 60);
 if (hrs < 24) return `${hrs}h ago`;
 const days = Math.floor(hrs / 24);
 return `${days}d ago`;
 };

 const dropdown = open ? createPortal(
 <div ref={dropdownRef} style={{ position: 'fixed', top: dropdownPos.top, right: Math.max(8, dropdownPos.right), zIndex: 9999 }}
 className="w-[min(calc(100vw-1rem),20rem)] sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in">
 {/* Header */}
 <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
 <h3 className="font-bold text-gray-900 text-sm">Notifications</h3>
 {unreadCount > 0 && (
 <button
 onClick={handleMarkAllRead}
 className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
 >
 <CheckCheck size={12} />Mark all read
 </button>
 )}
 </div>

 {/* Notification list */}
 <div className="max-h-[min(400px,calc(100dvh-8rem))] overflow-y-auto">
 {loading && notifications.length === 0 ? (
 <div className="py-10 text-center text-gray-400 text-sm">Loading...</div>
 ) : notifications.length === 0 ? (
 <div className="py-10 text-center">
 <Bell size={28} className="mx-auto text-gray-200 mb-2" />
 <p className="text-sm text-gray-400">No notifications yet</p>
 </div>
 ) : (
 notifications.map(notif => {
 const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
 const Icon = config.icon;
 return (
 <div
 key={notif._id}
 className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 transition-colors ${
 !notif.isRead ? 'bg-primary-50/40' : 'hover:bg-gray-50'
 }`}
 >
 <div className={`w-9 h-9 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
 <Icon size={16} className={config.color} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between gap-2">
 <p className={`text-sm leading-tight ${!notif.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
 {notif.title}
 </p>
 {!notif.isRead && (
 <button
 onClick={(e) => { e.stopPropagation(); handleMarkRead(notif._id); }}
 className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors flex-shrink-0"
 title="Mark as read"
 >
 <Check size={12} />
 </button>
 )}
 </div>
 <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
 <p className="text-[10px] text-gray-400 mt-1">{timeSince(notif.createdAt)}</p>
 </div>
 {!notif.isRead && (
 <div className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-2" />
 )}
 </div>
 );
 })
 )}
 </div>

 {/* Footer */}
 {notifications.length > 0 && (
 <div className="border-t border-gray-100 px-4 py-2.5">
 <Link
 to="/notifications"
 onClick={() => setOpen(false)}
 className="text-xs font-semibold text-primary-600 hover:text-primary-700"
 >
 View all notifications
 </Link>
 </div>
 )}
 </div>,
 document.body
 ) : null;

 return (
 <>
 {/* Bell button */}
 <button
 ref={bellRef}
 onClick={() => setOpen(!open)}
 className="relative p-2.5 rounded-xl hover:bg-gray-100 transition-colors"
 aria-label="View notifications"
 title="View notifications"
 >
 <Bell size={20} className="text-gray-600" />
 {unreadCount > 0 && (
 <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] rounded-full min-w-[16px] h-4 flex items-center justify-center font-bold px-0.5 animate-bounce-slow">
 {unreadCount > 99 ? '99+' : unreadCount}
 </span>
 )}
 </button>
 {dropdown}
 </>
 );
};

export default NotificationBell;
