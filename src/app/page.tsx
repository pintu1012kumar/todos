import { redirect } from 'next/navigation';
import { supabase } from '../app/supabase-client';

export default async function ProfilePage() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
   
   redirect('/login');
  }


  redirect('/todo');

  return (
    <div>
      <h1>Welcome, {user?.email}</h1>
      <p>This is your profile page.</p>
    </div>
  );
}