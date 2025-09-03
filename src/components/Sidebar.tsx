// components/Sidebar.tsx
'use client'

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { supabase } from '@/app/supabase-client'; // Adjust path if necessary
import { File, ListTodo, LogOut } from 'lucide-react';
import { handleLogout } from '@/app/supabase'; // Adjust path if necessary

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const handleUserLogout = async () => {
    await handleLogout(router);
  };

  return (
    <div className="flex flex-col h-screen p-4 space-y-4 border-r bg-gray-50">
      <h2 className="text-xl font-bold">Dashboard</h2>
      <nav className="flex-1 space-y-2">
        <Link href="/todo" passHref>
          <Button 
            variant={pathname === '/todos' ? 'secondary' : 'ghost'} 
            className="w-full justify-start gap-2"
          >
            <ListTodo className="h-4 w-4" />
            Todos
          </Button>
        </Link>
        <Link href="/documents" passHref>
          <Button 
            variant={pathname === '/documents' ? 'secondary' : 'ghost'} 
            className="w-full justify-start gap-2"
          >
            <File className="h-4 w-4" />
            File Uploader
          </Button>
        </Link>
      </nav>
      
    </div>
  );
}