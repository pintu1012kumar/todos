import { supabase } from "./supabase-client";
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

interface Todo {
  id: string;
  title: string;
  description: string;
  created_at: string;
  user_id: string;
}

interface NewTodo {
  title: string;
  description: string;
}

export const fetchTodos = async (): Promise<Todo[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }
  const { data: todos, error } = await supabase
    .from("demo")
    .select("*")
    .eq("user_id", user.id)
    .order('created_at', { ascending: false });
  if (error) {
    return [];
  }
  return (todos as Todo[]) || [];
};

export const insertTodo = async (todoData: NewTodo): Promise<boolean> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return false;
  }
  const todoWithUserId = { ...todoData, user_id: user.id };
  const { error } = await supabase.from("demo").insert(todoWithUserId);
  return !error;
};

export const updateTodo = async (id: string, todoData: NewTodo): Promise<boolean> => {
  console.log("Updating todo with ID:", id, "with data:", todoData);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return false;
  }
  const row = { id, user_id: user.id, ...todoData } as unknown as Todo;
  const { error } = await supabase
    .from("demo")
    .upsert(row, { onConflict: "id" });
  return !error;
  
};

export const deleteTodo = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from("demo").delete().eq("id", id); 
  if (error) {
    return false;
  }
  return true;
};

export const handleLogout = async (router: AppRouterInstance) => {
  const { error } = await supabase.auth.signOut();
  if (!error) {
    router.push("/login");
  }
};