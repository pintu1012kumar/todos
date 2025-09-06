"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import type { User } from '@supabase/supabase-js';
import { useRouter } from "next/navigation";
import { supabase } from "../supabase-client";
import { fetchTodos, insertTodo, updateTodo, deleteTodo, handleLogout } from '../supabase';
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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

const MAX_TITLE_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 200;

export default function TodoPage() {
  const [newTodo, setNewTodo] = useState<NewTodo>({ title: "", description: "" });
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [user, setUser] = useState<User | null>(null);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [error, setError] = useState<string>("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [todoToDelete, setTodoToDelete] = useState<Todo | null>(null);
  const router = useRouter();

  const handleFetchTodos = async () => {
    const fetchedTodos = await fetchTodos();
    setTodos(fetchedTodos);
  };

  const changeHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let newErrors = "";

    if (name === "title" && value.length > MAX_TITLE_LENGTH) {
      newErrors = `Title must be ${MAX_TITLE_LENGTH} characters or less.`;
    } else if (name === "description" && value.length > MAX_DESCRIPTION_LENGTH) {
      newErrors = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less.`;
    } else {
      newErrors = "";
      setNewTodo({ ...newTodo, [name]: value });
    }
    setError(newErrors);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (error) return;

    let success = false;
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
      setError("Failed to save todo. Please try again.");
      console.error("Failed to save todo.");
    }
  };

  const startEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setNewTodo({ title: todo.title, description: todo.description });
    setError("");
  };

  const cancelEdit = () => {
    setEditingTodo(null);
    setNewTodo({ title: "", description: "" });
    setError("");
  };

  // Show confirmation modal for delete
  const handleDeleteClick = (todo: Todo) => {
    setTodoToDelete(todo);
    setShowConfirmModal(true);
  };

  // Confirm delete action
  const confirmDelete = async () => {
    if (todoToDelete) {
      const success = await deleteTodo(todoToDelete.id);
      if (success) {
        handleFetchTodos();
      }
      setShowConfirmModal(false);
      setTodoToDelete(null);
    }
  };

  // Cancel delete action
  const cancelDelete = () => {
    setShowConfirmModal(false);
    setTodoToDelete(null);
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

  if (!user && !loading) {
    return null;
  }

  const handleBackToDocuments = () => {
    router.push("/documents");
  };

  // Confirmation Modal component
  const ConfirmModal = ({
    isOpen,
    message,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 flex flex-col">
          <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
          <p className="text-gray-700 mb-6">{message}</p>
          <div className="flex justify-end gap-3">
            <Button onClick={onCancel} variant="outline">
              Cancel
            </Button>
            <Button onClick={onConfirm} variant="destructive">
              Delete
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 p-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <Button onClick={handleBackToDocuments} variant="secondary" size="sm">
          documents upload
        </Button>
        <Button onClick={handleUserLogout} variant="outline" size="sm">
          Logout
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">
        {/* Left Section: Add/Edit Todo Form */}
        <div className="lg:w-1/2 lg:sticky lg:top-8 lg:h-fit">
          <h2 className="text-xl font-bold mb-4">
            {editingTodo ? "Edit Todo" : "Add New Todo"}
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid w-full items-center gap-3">
              <Label htmlFor="title">Title ({newTodo.title.length}/{MAX_TITLE_LENGTH})</Label>
              <Input
                type="text"
                onChange={changeHandler}
                name="title"
                id="title"
                placeholder="Title"
                value={newTodo.title}
                required
                maxLength={MAX_TITLE_LENGTH}
              />
            </div>

            <div className="grid w-full items-center gap-3">
              <Label htmlFor="description">Description ({newTodo.description.length}/{MAX_DESCRIPTION_LENGTH})</Label>
              <Input
                type="text"
                onChange={changeHandler}
                name="description"
                id="description"
                placeholder="Description"
                value={newTodo.description}
                required
                maxLength={MAX_DESCRIPTION_LENGTH}
              />
            </div>

            <Button type="submit">
              {editingTodo ? "Update Todo" : "Add Todo"}
            </Button>
            {editingTodo && (
              <Button onClick={cancelEdit} variant="secondary">
                Cancel
              </Button>
            )}
          </form>
        </div>

        {/* Right Section: My Todos List */}
        <div className="lg:w-1/2">
          <h2 className="text-xl font-bold mb-4">My Todos</h2>
          {todos.length > 0 ? (
            <ul className="space-y-4">
              {todos.map((todo) => (
                <li
                  key={todo.id}
                  className="p-4 rounded-lg border border-gray-200 shadow-sm"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold flex-grow truncate">{todo.title}</h3>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button onClick={() => startEdit(todo)} variant="ghost" size="sm">
                        Edit
                      </Button>
                      <Button
                        onClick={() => handleDeleteClick(todo)}
                        variant="destructive"
                        size="sm"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 break-words whitespace-pre-line max-w-full">
                    {todo.description}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No todos found. Add one above!</p>
          )}
        </div>
      </div>
      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        message={
          todoToDelete
            ? `Are you sure you want to delete "${todoToDelete.title}"? This action cannot be undone.`
            : ""
        }
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div> 
  );  
}