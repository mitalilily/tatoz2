import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    sidebarOpen: false,
    cartOpen: false,
    searchOpen: false,
    mobileMenuOpen: false,
    chatOpen: false,
  },
  reducers: {
    toggleSidebar: (state) => { state.sidebarOpen = !state.sidebarOpen; },
    setSidebarOpen: (state, action) => { state.sidebarOpen = action.payload; },
    toggleCart: (state) => { state.cartOpen = !state.cartOpen; },
    setCartOpen: (state, action) => { state.cartOpen = action.payload; },
    toggleSearch: (state) => { state.searchOpen = !state.searchOpen; },
    toggleMobileMenu: (state) => { state.mobileMenuOpen = !state.mobileMenuOpen; },
    toggleChat: (state) => { state.chatOpen = !state.chatOpen; },
    setChatOpen: (state, action) => { state.chatOpen = action.payload; },
  },
});

export const { toggleSidebar, setSidebarOpen, toggleCart, setCartOpen, toggleSearch, toggleMobileMenu, toggleChat, setChatOpen } = uiSlice.actions;
export default uiSlice.reducer;
