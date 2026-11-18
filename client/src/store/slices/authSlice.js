import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { PLATFORM_NAME } from '../../constants/branding';

export const sendOtp = createAsyncThunk('auth/sendOtp', async (input, { rejectWithValue }) => {
  try {
    const payload = typeof input === 'string' ? { phone: input, purpose: 'login' } : { ...(input || {}), purpose: input?.purpose || 'login' };
    const res = await authAPI.sendOtp(payload);
    return res.data;
  } catch (err) { return rejectWithValue(err.message); }
});

export const verifyOtp = createAsyncThunk('auth/verifyOtp', async ({ phone, email, channel, otp, purpose = 'login', authMethod }, { rejectWithValue }) => {
  try {
    const res = await authAPI.verifyOtp({ phone, email, channel, otp, purpose, authMethod });
    return res.data;
  } catch (err) { return rejectWithValue(err.message); }
});

export const passwordLogin = createAsyncThunk('auth/passwordLogin', async (data, { rejectWithValue }) => {
  try {
    const res = await authAPI.passwordLogin(data);
    return res.data;
  } catch (err) { return rejectWithValue(err.message); }
});

export const register = createAsyncThunk('auth/register', async (data, { rejectWithValue }) => {
  try {
    const res = await authAPI.register(data);
    return res.data;
  } catch (err) { return rejectWithValue(err.message); }
});

export const googleLogin = createAsyncThunk('auth/googleLogin', async (credential, { rejectWithValue }) => {
  try {
    const res = await authAPI.googleLogin(credential);
    return res.data;
  } catch (err) { return rejectWithValue(err.message); }
});

export const adminLogin = createAsyncThunk('auth/adminLogin', async (data, { rejectWithValue }) => {
  try {
    const res = await authAPI.adminLogin(data);
    return res.data;
  } catch (err) { return rejectWithValue(err.message); }
});

export const getMe = createAsyncThunk('auth/getMe', async (_, { rejectWithValue }) => {
  try {
    const res = await authAPI.getMe();
    return res.data;
  } catch (err) { return rejectWithValue(err.message); }
});

export const getAuthConfig = createAsyncThunk('auth/getAuthConfig', async (_, { rejectWithValue }) => {
  try {
    const res = await authAPI.getConfig();
    return res.data?.auth || null;
  } catch (err) { return rejectWithValue(err.message); }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await authAPI.logout().catch(() => {});
});

export const updateProfile = createAsyncThunk('auth/updateProfile', async (data, { rejectWithValue }) => {
  try {
    const res = await authAPI.updateProfile(data);
    toast.success('Profile updated!');
    return res.data;
  } catch (err) { return rejectWithValue(err.message); }
});

export const changePhone = createAsyncThunk('auth/changePhone', async ({ phone, otp }, { rejectWithValue }) => {
  try {
    const res = await authAPI.changePhoneVerify(phone, otp);
    return res.data;
  } catch (err) { return rejectWithValue(err.message); }
});

export const toggleWishlist = createAsyncThunk('auth/toggleWishlist', async (productId, { rejectWithValue }) => {
  try {
    const res = await authAPI.toggleWishlist(productId);
    return res.data;
  } catch (err) { return rejectWithValue(err.message); }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token: null,
    session: null,
    cartVerificationEnabled: null,
    cartVerificationProvider: null,
    isAuthenticated: false,
    loading: false,
    otpSending: false,
    otpSent: false,
    initialized: false,
    error: null,
  },
  reducers: {
    resetOtpState: (state) => { state.otpSent = false; state.otpSending = false; },
  },
  extraReducers: (builder) => {
    const handlePending = (state) => { state.loading = true; state.error = null; };
    const handleRejected = (state, action) => {
      state.loading = false;
      state.error = action.payload;
      toast.error(action.payload || 'Something went wrong');
    };

    builder
      .addCase(sendOtp.pending, (state) => { state.otpSending = true; state.error = null; })
      .addCase(sendOtp.fulfilled, (state) => {
        state.otpSending = false;
        state.otpSent = true;
        toast.success('OTP sent!');
      })
      .addCase(sendOtp.rejected, (state, action) => {
        state.otpSending = false;
        state.error = action.payload;
        toast.error(action.payload || 'Failed to send OTP');
      })

      .addCase(verifyOtp.pending, handlePending)
      .addCase(verifyOtp.fulfilled, (state, action) => {
        state.loading = false;
        if (action.meta.arg?.purpose === 'cart_step_up') {
          // Phone cart verification creates a customer session for anonymous
          // shoppers. Email cart verification only upgrades the existing
          // signed-in session, so preserve the current identity in that case.
          if (action.payload.user) {
            state.user = action.payload.user;
            state.isAuthenticated = true;
            state.token = null;
          }
          state.session = action.payload.session || { ...state.session, otpVerified: true };
          state.otpSent = false;
          toast.success('Cart verification complete');
          return;
        }
        state.user = action.payload.user;
        state.token = null;
        state.session = action.payload.session || null;
        state.isAuthenticated = true;
        state.otpSent = false;
        const name = action.payload.user.name || 'there';
        toast.success(action.payload.isNewUser ? `Welcome to ${PLATFORM_NAME}!` : `Welcome back, ${name}!`);
      })
      .addCase(verifyOtp.rejected, handleRejected)

      .addCase(passwordLogin.pending, handlePending)
      .addCase(passwordLogin.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = null;
        state.session = action.payload.session || null;
        state.isAuthenticated = true;
        state.initialized = true;
        toast.success(`Welcome back, ${action.payload.user.name || 'there'}!`);
      })
      .addCase(passwordLogin.rejected, handleRejected)

      .addCase(register.pending, handlePending)
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = null;
        state.session = action.payload.session || null;
        state.isAuthenticated = true;
        state.initialized = true;
        toast.success('Account created successfully!');
      })
      .addCase(register.rejected, handleRejected)

      .addCase(googleLogin.pending, handlePending)
      .addCase(googleLogin.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = null;
        state.session = action.payload.session || null;
        state.isAuthenticated = true;
        toast.success(`Welcome, ${action.payload.user.name}!`);
      })
      .addCase(googleLogin.rejected, handleRejected)

      .addCase(adminLogin.pending, handlePending)
      .addCase(adminLogin.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = null;
        state.session = action.payload.session || null;
        state.isAuthenticated = true;
        state.initialized = true;
        toast.success('Admin logged in!');
      })
      .addCase(adminLogin.rejected, handleRejected)

      .addCase(getMe.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.session = action.payload.session || null;
        state.isAuthenticated = true;
        state.initialized = true;
      })
      .addCase(getMe.rejected, (state) => {
        state.user = null;
        state.session = null;
        state.isAuthenticated = false;
        state.initialized = true;
      })

      .addCase(getAuthConfig.fulfilled, (state, action) => {
        state.cartVerificationEnabled = action.payload?.cartVerificationEnabled === true;
        state.cartVerificationProvider = action.payload?.cartOtpProvider || null;
      })

      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.session = null;
        state.isAuthenticated = false;
        state.otpSent = false;
        toast.success('Logged out successfully');
      })

      .addCase(updateProfile.fulfilled, (state, action) => {
        state.user = action.payload.user;
      })

      .addCase(changePhone.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.token = null;
        state.session = action.payload.session || null;
        state.isAuthenticated = true;
        if (action.payload.switchedAccount) {
          toast.success(action.payload.message || 'Logged in as the account linked to this number');
        } else {
          toast.success(action.payload.message || 'Phone number updated');
        }
      })
      .addCase(changePhone.rejected, (state, action) => {
        toast.error(action.payload || 'Failed to update phone');
      })

      .addCase(toggleWishlist.fulfilled, (state, action) => {
        if (state.user) state.user.wishlist = action.payload.wishlist;
      });
  },
});

export const { resetOtpState } = authSlice.actions;
export default authSlice.reducer;
