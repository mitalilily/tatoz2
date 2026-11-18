import { Redirect } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function IndexRoute() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return <Redirect href={user ? '/home' : '/login'} />;
}

