// LoginPage.tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "../supabase-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const router = useRouter();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Login failed:", data.error);
        setMessage({ text: `Login failed: ${data.error}`, type: 'error' });
      } else {
        await supabase.auth.setSession(data.data);

        console.log("User logged in:", data);
        setMessage({ text: 'Login successful!', type: 'success' });
        
        setTimeout(() => {
          router.push('/todo');
        }, 1000); 
      }
    } catch (error) {
      console.error("An unexpected error occurred:", error);
      setMessage({ text: 'An unexpected error occurred. Please try again.', type: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold text-center">Log In</h1>
      
      {message && (
        <div className={`p-3 rounded-md text-center ${message.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleLogin}>
        <div className="grid w-full items-center mb-2 gap-3">
          <Label htmlFor="email">Email</Label>
          <Input type="email" id="email" name="email" placeholder="Email" onChange={handleChange} />
        </div>
        <div className="grid w-full items-center mb-2 gap-3">
          <Label htmlFor="password">Password</Label>
          <Input type="password" id="password" name="password" placeholder="Password" onChange={handleChange} />
        </div>
        <Button type="submit">Log In</Button>
      </form>
      <p className="text-center text-sm text-gray-500">
        Do not have an account?{" "}
        <Link href="/signup" className="underline hover:text-gray-900">
          Sign up
        </Link>
      </p>
    </div>
  );
}
