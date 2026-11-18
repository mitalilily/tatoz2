import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Search, X, Loader2, AlertTriangle, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { conversationAPI } from '../../services/api';
import toast from 'react-hot-toast';

const CATEGORY_LABELS = {
 shop_assistant: { label: 'Shop', emoji: '🛍️', bg: 'bg-indigo-50', text: 'text-indigo-700' },
 order_query: { label: 'Order', emoji: '📦', bg: 'bg-amber-50', text: 'text-amber-700' },
 payment_query: { label: 'Payment', emoji: '💳', bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

const STATUS_BADGES = {
 active: { label: 'Active', bg: 'bg-blue-50', text: 'text-blue-700' },
 resolved: { label: 'Resolved', bg: 'bg-green-50', text: 'text-green-700' },
 escalated: { label: 'Escalated', bg: 'bg-red-50', text: 'text-red-700' },
};

const timeAgo = (date) => {
 const s = Math.floor((Date.now() - new Date(date)) / 1000);
 if (s < 60) return 'Just now';
 if (s < 3600) return `${Math.floor(s / 60)}m ago`;
 if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
 return `${Math.floor(s / 86400)}d ago`;
};

const ConversationsPage = () => {
 const [tab, setTab] = useState('all'); // all | escalated | analytics
 const [conversations, setConversations] = useState([]);
 const [pagination, setPagination] = useState(null);
 const [loading, setLoading] = useState(true);
 const [filters, setFilters] = useState({ status: '', category: '', search: '', page: 1 });
 const [selectedConv, setSelectedConv] = useState(null);
 const [detailLoading, setDetailLoading] = useState(false);
 const [adminNotes, setAdminNotes] = useState('');
 const [analytics, setAnalytics] = useState(null);
 const [analyticsLoading, setAnalyticsLoading] = useState(false);
 const [escalatedCount, setEscalatedCount] = useState(0);

 const fetchConversations = useCallback(async () => {
 setLoading(true);
 try {
 const params = { ...filters, limit: 20 };
 if (tab === 'escalated') params.status = 'escalated';
 const res = await conversationAPI.getAll(params);
 setConversations(res.data.conversations);
 setPagination(res.data.pagination);
 } catch { } finally { setLoading(false); }
 }, [filters, tab]);

 const fetchEscalatedCount = useCallback(async () => {
 try {
 const res = await conversationAPI.getAll({ status: 'escalated', limit: 1 });
 setEscalatedCount(res.data.pagination?.total || 0);
 } catch { }
 }, []);

 const fetchAnalytics = useCallback(async () => {
 setAnalyticsLoading(true);
 try {
 const res = await conversationAPI.getAnalytics();
 setAnalytics(res.data.analytics);
 } catch { } finally { setAnalyticsLoading(false); }
 }, []);

 useEffect(() => {
 if (tab === 'analytics') fetchAnalytics();
 else fetchConversations();
 }, [tab, fetchConversations, fetchAnalytics]);

 useEffect(() => { fetchEscalatedCount(); }, [fetchEscalatedCount]);

 const handleViewDetail = async (id) => {
 setDetailLoading(true);
 try {
 const res = await conversationAPI.getOne(id);
 setSelectedConv(res.data.conversation);
 setAdminNotes(res.data.conversation.escalation?.adminNotes || '');
 } catch {
 toast.error('Failed to load conversation');
 } finally { setDetailLoading(false); }
 };

 const handleResolve = async () => {
 if (!selectedConv) return;
 try {
 await conversationAPI.update(selectedConv._id, { status: 'resolved', adminNotes });
 toast.success('Conversation resolved');
 setSelectedConv(null);
 fetchConversations();
 fetchEscalatedCount();
 } catch {
 toast.error('Failed to update');
 }
 };

 const handleSaveNotes = async () => {
 if (!selectedConv) return;
 try {
 await conversationAPI.update(selectedConv._id, { adminNotes });
 toast.success('Notes saved');
 } catch {
 toast.error('Failed to save notes');
 }
 };

 const updateFilter = (key, value) => {
 setFilters(f => ({ ...f, [key]: value, ...(key !== 'page' && { page: 1 }) }));
 };

 // ─── Render ───

 return (
 <div className="space-y-6 animate-fade-in">
 <div>
 <h1 className="text-2xl font-bold text-gray-900">AI Conversations</h1>
 <p className="text-sm text-gray-500 mt-1">View and manage customer chatbot conversations</p>
 </div>

 {/* Tabs */}
 <div className="flex gap-0 border-b-2 border-gray-100">
 <button onClick={() => setTab('all')} className={`px-5 py-2.5 text-sm font-medium transition-colors ${tab === 'all' ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-[2px]' : 'text-gray-500 hover:text-gray-700'}`}>
 All Conversations
 </button>
 <button onClick={() => setTab('escalated')} className={`px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${tab === 'escalated' ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-[2px]' : 'text-gray-500 hover:text-gray-700'}`}>
 Escalated
 {escalatedCount > 0 && (
 <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{escalatedCount}</span>
 )}
 </button>
 <button onClick={() => setTab('analytics')} className={`px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === 'analytics' ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-[2px]' : 'text-gray-500 hover:text-gray-700'}`}>
 <BarChart2 size={14} /> Analytics
 </button>
 </div>

 {/* Analytics Tab */}
 {tab === 'analytics' && (
 analyticsLoading ? (
 <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
 ) : analytics ? (
 <div className="space-y-6">
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 {[
 { label: 'Total Conversations', value: analytics.total, color: 'text-gray-900' },
 { label: 'Credits Used', value: analytics.totalCredits, color: 'text-indigo-600' },
 { label: 'Escalation Rate', value: `${analytics.escalationRate}%`, color: 'text-amber-600' },
 { label: 'Avg Messages', value: analytics.avgMessages, color: 'text-gray-900' },
 ].map((s, i) => (
 <div key={i} className="card p-5">
 <p className="text-xs text-gray-500 mb-1">{s.label}</p>
 <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
 </div>
 ))}
 </div>
 <div className="card p-5">
 <h3 className="text-sm font-semibold text-gray-900 mb-4">By Category</h3>
 <div className="space-y-3">
 {analytics.byCategory.map(c => {
 const cat = CATEGORY_LABELS[c.category] || { label: c.category, emoji: '' };
 const pct = analytics.total > 0 ? Math.round((c.count / analytics.total) * 100) : 0;
 return (
 <div key={c.category}>
 <div className="flex justify-between text-sm mb-1">
 <span className="text-gray-600">{cat.emoji} {cat.label}</span>
 <span className="font-semibold text-gray-900">{c.count} ({pct}%)</span>
 </div>
 <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
 <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
 </div>
 </div>
 );
 })}
 </div>
 </div>
 <div className="card p-5">
 <h3 className="text-sm font-semibold text-gray-900 mb-4">By Status</h3>
 <div className="flex gap-6">
 {Object.entries(analytics.byStatus).map(([key, val]) => {
 const badge = STATUS_BADGES[key];
 return (
 <div key={key} className="flex items-center gap-2">
 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>{badge.label}</span>
 <span className="text-sm font-semibold text-gray-900">{val}</span>
 </div>
 );
 })}
 </div>
 </div>
 </div>
 ) : null
 )}

 {/* List Tabs (all / escalated) */}
 {tab !== 'analytics' && (
 <>
 {/* Filters */}
 {tab === 'all' && (
 <div className="flex flex-wrap items-center gap-2">
 <select value={filters.status} onChange={e => updateFilter('status', e.target.value)} className="input py-2 text-sm w-36 bg-white">
 <option value="">All Statuses</option>
 <option value="active">Active</option>
 <option value="resolved">Resolved</option>
 <option value="escalated">Escalated</option>
 </select>
 <select value={filters.category} onChange={e => updateFilter('category', e.target.value)} className="input py-2 text-sm w-40 bg-white">
 <option value="">All Categories</option>
 <option value="shop_assistant">Shop Assistant</option>
 <option value="order_query">Order</option>
 <option value="payment_query">Payment</option>
 </select>
 <div className="relative ml-auto">
 <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input
 type="text"
 value={filters.search}
 onChange={e => updateFilter('search', e.target.value)}
 placeholder="Search user..."
 className="input py-2 pl-8 text-sm w-48 bg-white"
 />
 </div>
 </div>
 )}

 {/* Table */}
 {loading ? (
 <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
 ) : conversations.length === 0 ? (
 <div className="text-center py-16 text-gray-400">
 <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
 <p className="text-sm">No conversations found</p>
 </div>
 ) : (
 <>
 <div className="card overflow-hidden">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-gray-50">
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Category</th>
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Messages</th>
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
 {tab === 'escalated' && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Reason</th>}
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Started</th>
 <th className="px-4 py-3"></th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100">
 {conversations.map(c => {
 const cat = CATEGORY_LABELS[c.category] || { label: c.category, emoji: '', bg: 'bg-gray-50', text: 'text-gray-700' };
 const status = STATUS_BADGES[c.status] || STATUS_BADGES.active;
 return (
 <tr key={c._id} className="hover:bg-gray-50 transition-colors">
 <td className="px-4 py-3">
 <div className="font-medium text-gray-900">{c.user?.name || 'Unknown'}</div>
 <div className="text-xs text-gray-400">{c.user?.email}</div>
 </td>
 <td className="px-4 py-3">
 <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cat.bg} ${cat.text}`}>
 {cat.emoji} {cat.label}
 </span>
 </td>
 <td className="px-4 py-3 text-gray-600">{c.messageCount}</td>
 <td className="px-4 py-3">
 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
 {status.label}
 </span>
 </td>
 {tab === 'escalated' && (
 <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{c.escalation?.reason || '—'}</td>
 )}
 <td className="px-4 py-3 text-gray-400 text-xs">{timeAgo(c.createdAt)}</td>
 <td className="px-4 py-3">
 <button onClick={() => handleViewDetail(c._id)} className="text-indigo-600 hover:text-indigo-700 font-medium text-xs">
 View →
 </button>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>

 {/* Pagination */}
 {pagination && pagination.pages > 1 && (
 <div className="flex items-center justify-center gap-2">
 <button
 onClick={() => updateFilter('page', filters.page - 1)}
 disabled={filters.page <= 1}
 className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40"
 >
 <ChevronLeft size={16} />
 </button>
 <span className="text-sm text-gray-500">Page {filters.page} of {pagination.pages}</span>
 <button
 onClick={() => updateFilter('page', filters.page + 1)}
 disabled={filters.page >= pagination.pages}
 className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40"
 >
 <ChevronRight size={16} />
 </button>
 </div>
 )}
 </>
 )}
 </>
 )}

 {/* Detail Modal */}
 {(selectedConv || detailLoading) && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !detailLoading && setSelectedConv(null)}>
 <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
 {detailLoading ? (
 <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
 ) : selectedConv && (
 <>
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
 <div>
 <div className="font-bold text-gray-900">{selectedConv.user?.name}</div>
 <div className="text-xs text-gray-400">
 {CATEGORY_LABELS[selectedConv.category]?.emoji} {CATEGORY_LABELS[selectedConv.category]?.label} · {selectedConv.messages?.length} messages · {timeAgo(selectedConv.createdAt)}
 </div>
 </div>
 <div className="flex items-center gap-3">
 {(() => { const s = STATUS_BADGES[selectedConv.status]; return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>; })()}
 <button onClick={() => setSelectedConv(null)} className="text-gray-400 hover:text-gray-600">
 <X size={20} />
 </button>
 </div>
 </div>

 {/* Escalation Banner */}
 {selectedConv.status === 'escalated' && selectedConv.escalation?.reason && (
 <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
 <div className="flex items-center gap-2 mb-2">
 <AlertTriangle size={14} className="text-red-500" />
 <span className="text-xs font-semibold text-red-700">Escalation Reason</span>
 </div>
 <p className="text-sm text-red-800 mb-3">{selectedConv.escalation.reason}</p>
 <div className="flex gap-2">
 <button onClick={handleResolve} className="btn-primary py-1.5 px-4 text-xs">Mark Resolved</button>
 <input
 value={adminNotes}
 onChange={e => setAdminNotes(e.target.value)}
 placeholder="Add admin note..."
 className="input py-1.5 text-xs flex-1"
 />
 <button onClick={handleSaveNotes} className="btn-secondary py-1.5 px-3 text-xs">Save</button>
 </div>
 {selectedConv.escalation.resolvedBy && (
 <p className="text-[10px] text-gray-400 mt-2">Resolved by {selectedConv.escalation.resolvedBy.name} at {new Date(selectedConv.escalation.resolvedAt).toLocaleString()}</p>
 )}
 </div>
 )}

 {/* Messages */}
 <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
 {selectedConv.messages?.map((m, i) => (
 <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'gap-2'}`}>
 {m.role === 'assistant' && (
 <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
 <MessageSquare size={12} className="text-indigo-500" />
 </div>
 )}
 <div className={`max-w-[75%] px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${
 m.role === 'user'
 ? 'bg-indigo-600 text-white rounded-xl rounded-tr-none'
 : 'bg-gray-100 text-gray-800 rounded-xl rounded-tl-none'
 }`}>
 {m.content}
 </div>
 </div>
 ))}
 </div>
 </>
 )}
 </div>
 </div>
 )}
 </div>
 );
};

export default ConversationsPage;
