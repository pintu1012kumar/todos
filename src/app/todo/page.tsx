// This is the first file, your TodoPage.tsx

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import type { User } from '@supabase/supabase-js';
import { useRouter } from "next/navigation";
import { supabase } from "../supabase-client";
import { fetchTodos, insertTodo, updateTodo, deleteTodo, handleLogout } from '../supabase'; // Import the separate functions

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

export default function TodoPage() {
  const [newTodo, setNewTodo] = useState<NewTodo>({ title: "", description: "" });
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const router = useRouter();


  const handleFetchTodos = async () => {
    setLoading(true);
    const fetchedTodos = await fetchTodos();
    setTodos(fetchedTodos);
    setLoading(false);
  };

  const changeHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewTodo({ ...newTodo, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    let success = false;
    
    // Check if we are in "edit" mode
    if (editingTodo) {
      success = await updateTodo(editingTodo.id, newTodo);
    } else {
      success = await insertTodo(newTodo);
    }
    
    if (success) {
      setNewTodo({ title: "", description: "" });
      setEditingTodo(null);
      handleFetchTodos();
    } else {
        // You might want to add a more detailed error message here
        console.error("Failed to save todo.");
    }
  };

  const startEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setNewTodo({ title: todo.title, description: todo.description });
  };

  const handleDelete = async (id: string) => {
    const success = await deleteTodo(id);
    if (success) {
      handleFetchTodos();
    }
  };

  const handleUserLogout = async () => {
    await handleLogout(router);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          setTodos([]); 
          setEditingTodo(null);
          router.push('/login');
        } else {
          setUser(session.user);
          handleFetchTodos();
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 p-8 max-w-sm mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Todo</h1>
        <Button onClick={handleUserLogout} variant="outline" size="sm">
          Logout
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid w-full items-center gap-3">
          <Label htmlFor="title">Title</Label>
          <Input
            type="text"
            onChange={changeHandler}
            name="title"
            id="title"
            placeholder="Title"
            value={newTodo.title}
            required
          />
        </div>

        <div className="grid w-full items-center gap-3">
          <Label htmlFor="description">Description</Label>
          <Input
            type="text"
            onChange={changeHandler}
            name="description"
            id="description"
            placeholder="Description"
            value={newTodo.description}
            required
          />
        </div>

        <Button type="submit">
          {editingTodo ? "Update Todo" : "Add Todo"}
        </Button>
      </form>

      <div className="mt-8">
        <h2 className="text-xl font-bold">My Todos</h2>
        {todos.length > 0 ? (
          <ul className="space-y-4">
            {todos.map((todo) => (
              <li
                key={todo.id}
                className="p-4 rounded-lg border border-gray-200 shadow-sm"
              >
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">{todo.title}</h3>
                  <div className="flex gap-2">
                    <Button onClick={() => startEdit(todo)} variant="ghost" size="sm">
                      Edit
                    </Button>
                    <Button onClick={() => handleDelete(todo.id)} variant="destructive" size="sm">
                      Delete
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-gray-600">{todo.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No todos found. Add one above!</p>
        )}
      </div>
    </div>
  );
}