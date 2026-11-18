import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, ShoppingBag, Tag, AlertCircle, Star, Megaphone } from 'lucide-react';
import { notificationAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import Pagination from '../../components/common/Pagination';
import SEO from '../../components/common/SEO';

const TYPE_CONFIG = {
 order: { icon: ShoppingBag, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Order' },
 promo: { icon: Tag, color: 'text-green-500', bg: 'bg-green-50', label: 'Promotion' },
 system: { icon: Megaphone, color: 'text-primary-500', bg: 'bg-primary-50', label: 'System' },
 alert: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Alert' },
 review: { icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-50', label: 'Review' },
};

const NotificationsPage = () => {
 const [notifications, setNotifications] = useState([]);
 const [unreadCount, setUnreadCount] = useState(0);
 const [loading, setLoading] = useState(true);
 const [page, setPage] = useState(1);
 const [pagination, setPagination] = useState(null);

 const fetchNotifications = useCallback(async () => {
 setLoading(true);
 try {
 const res = await notificationAPI.getAll({ page, limit: 15 });
 setNotifications(res.data.notifications || []);
 setUnreadCount(res.data.unreadCount || 0);
 setPagination(res.data.pagination);
 } catch {}
 finally { setLoading(false); }
 }, [page]);

 useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

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

 const formatDate = (date) => {
 const d = new Date(date);
 const now = new Date();
 const diffMs = now - d;
 const diffMins = Math.floor(diffMs / 60000);
 if (diffMins < 60) return `${diffMins}m ago`;
 const diffHrs = Math.floor(diffMins / 60);
 if (diffHrs < 24) return `${diffHrs}h ago`;
 if (diffHrs < 48) return 'Yesterday';
 return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
 };

 return (
 <div className="page-container max-w-2xl py-6 sm:py-8 animate-fade-in">
 <SEO title="Notifications" description="Your notifications" />

 <div className="flex flex-wrap items-start justify-between gap-3 mb-5 sm:mb-6">
 <div>
 <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
 <Bell size={24} className="text-primary-600" />Notifications
 </h1>
 {unreadCount > 0 && (
 <p className="text-sm text-gray-500 mt-1">{unreadCount} unread</p>
 )}
 </div>
 {unreadCount > 0 && (
 <button onClick={handleMarkAllRead}
 className="ml-auto flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors sm:px-3 sm:text-sm">
 <CheckCheck size={14} />Mark all read
 </button>
 )}
 </div>

 {loading ? (
 <div className="flex justify-center py-16"><Loader size="md" /></div>
 ) : notifications.length === 0 ? (
 <EmptyState icon={Bell} title="No notifications" description="You're all caught up! Notifications will appear here." />
 ) : (
 <>
 <div className="space-y-2">
 {notifications.map(notif => {
 const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
 const Icon = config.icon;
 return (
 <div
 key={notif._id}
 className={`flex flex-wrap items-start gap-3 p-3 sm:gap-4 sm:p-4 rounded-2xl border-2 transition-all ${
 !notif.isRead
 ? 'bg-primary-50/30 border-primary-100'
 : 'bg-white border-gray-100 hover:border-gray-200'
 }`}
 >
 <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
 <Icon size={18} className={config.color} />
 </div>
 <div className="min-w-0 flex-1">
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div className="min-w-0">
 <p className={`text-sm ${!notif.isRead ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
 {notif.title}
 </p>
 <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1 ${config.bg} ${config.color}`}>
 {config.label}
 </span>
 </div>
 <span className="shrink-0 text-xs text-gray-400 mt-0.5">{formatDate(notif.createdAt)}</span>
 </div>
 <p className="break-anywhere text-sm text-gray-600 mt-1.5 leading-relaxed">{notif.message}</p>
 </div>
 {!notif.isRead && (
 <button
 onClick={() => handleMarkRead(notif._id)}
 className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-primary-600 transition-colors flex-shrink-0"
 title="Mark as read"
 >
 <Check size={14} />
 </button>
 )}
 </div>
 );
 })}
 </div>

 {pagination && pagination.pages > 1 && (
 <div className="mt-6">
 <Pagination currentPage={page} totalPages={pagination.pages} onPageChange={setPage} />
 </div>
 )}
 </>
 )}
 </div>
 );
};

export default NotificationsPage;
