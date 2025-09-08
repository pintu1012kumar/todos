"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";
import { supabase } from "../supabase-client";

interface AlertState {
  title: string;
  description: string;
  variant: "default" | "destructive";
}

export default function SignupPage() {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [alertInfo, setAlertInfo] = useState<AlertState | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.push('/todo');
      }
    };
    checkUser();
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAlertInfo(null); // Clear previous alerts

    // Password validation logic
    if (formData.password !== formData.confirmPassword) {
      setAlertInfo({
        title: "Passwords Do Not Match",
        description: "Please ensure both passwords are the same and try again.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
      setAlertInfo({
        title: "Missing Information",
        description: "All fields are required. Please fill them out.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Sign up failed:", data.error);
        setAlertInfo({
          title: "Sign Up Failed",
          description: data.error,
          variant: "destructive",
        });
      } else {
        console.log("User signed up:", data);
        setAlertInfo({
          title: "Success!",
          description: "Sign up successful! Please check your email for a confirmation link.",
          variant: "default",
        });
        
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    } catch (error) {
      console.error("An unexpected error occurred:", error);
      setAlertInfo({
        title: "Unexpected Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold text-center">Create an Account</h1>
      
      {/* Conditionally render the alert component */}
      {alertInfo && (
        <Alert variant={alertInfo.variant}>
          <Terminal className="h-4 w-4" />
          <AlertTitle>{alertInfo.title}</AlertTitle>
          <AlertDescription>{alertInfo.description}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSignUp}>
        <div className="grid w-full items-center mb-2 gap-3">
          <Label htmlFor="name">Name</Label>
          <Input
            type="text"
            id="name"
            name="name"
            placeholder="Name"
            onChange={handleChange}
          />
        </div>
        <div className="grid w-full items-center mb-2 gap-3">
          <Label htmlFor="email">Email</Label>
          <Input
            type="email"
            id="email"
            name="email"
            placeholder="Email"
            onChange={handleChange}
          />
        </div>
        <div className="grid w-full items-center mb-2 gap-3">
          <Label htmlFor="password">Password</Label>
          <Input
            type="password"
            id="password"
            name="password"
            placeholder="Password"
            onChange={handleChange}
          />
        </div>
        <div className="grid w-full items-center mb-2 gap-3">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            placeholder="Confirm Password"
            onChange={handleChange}
          />
        </div>
        <Button type="submit">Sign Up</Button>
      </form>
      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="underline hover:text-gray-900">
          Login
        </Link>
      </p>
    </div>
  );
}