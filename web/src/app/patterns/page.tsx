"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Regex,
  RefreshCw,
  Plus,
  Trash2,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Pattern {
  id: string;
  name: string;
  pattern: string;
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export default function PatternsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testResults, setTestResults] = useState<{ name: string; matches: string[] }[]>([]);

  // New pattern form
  const [newName, setNewName] = useState("");
  const [newPattern, setNewPattern] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [patternError, setPatternError] = useState<string | null>(null);

  const loadPatterns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/patterns");
      const data = await response.json();
      if (data.success) {
        setPatterns(data.patterns);
      } else {
        setError(data.error || "Failed to load patterns");
      }
    } catch (err) {
      setError("Failed to connect to server");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatterns();
  }, [loadPatterns]);

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch("/api/patterns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      const data = await response.json();
      if (data.success) {
        setPatterns((prev) =>
          prev.map((p) => (p.id === id ? { ...p, enabled } : p))
        );
      }
    } catch (err) {
      console.error("Failed to update pattern:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this pattern?")) return;

    try {
      const response = await fetch(`/api/patterns?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        setPatterns((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete pattern:", err);
    }
  };

  const validatePattern = (pattern: string): boolean => {
    try {
      new RegExp(pattern);
      setPatternError(null);
      return true;
    } catch (e) {
      setPatternError(`Invalid regex: ${(e as Error).message}`);
      return false;
    }
  };

  const handleAddPattern = async () => {
    if (!newName.trim() || !newPattern.trim()) {
      setPatternError("Name and pattern are required");
      return;
    }

    if (!validatePattern(newPattern)) return;

    try {
      const response = await fetch("/api/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          pattern: newPattern.trim(),
          description: newDescription.trim(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        setNewName("");
        setNewPattern("");
        setNewDescription("");
        setIsAdding(false);
        loadPatterns();
      } else {
        setPatternError(data.error);
      }
    } catch (err) {
      setPatternError("Failed to add pattern");
      console.error(err);
    }
  };

  const handleTestPatterns = () => {
    if (!testInput.trim()) {
      setTestResults([]);
      return;
    }

    const results: { name: string; matches: string[] }[] = [];
    
    for (const pattern of patterns.filter((p) => p.enabled)) {
      try {
        const regex = new RegExp(pattern.pattern, "gi");
        const matches = testInput.match(regex);
        if (matches && matches.length > 0) {
          results.push({ name: pattern.name, matches });
        }
      } catch {
        // Skip invalid patterns
      }
    }

    setTestResults(results);
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Regex className="h-6 w-6" />
            API Key Patterns
          </h1>
          <p className="text-muted-foreground">
            Manage regex patterns used to detect API keys
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadPatterns} variant="outline" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
            <Plus className="h-4 w-4 mr-2" />
            Add Pattern
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <AlertTriangle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Pattern Form */}
      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Pattern</CardTitle>
            <CardDescription>
              Create a new regex pattern to detect API keys
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="e.g., OpenAI"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Pattern (Regex)</label>
                <Input
                  placeholder="e.g., sk-[a-zA-Z0-9]{20,}"
                  value={newPattern}
                  onChange={(e) => {
                    setNewPattern(e.target.value);
                    if (e.target.value) validatePattern(e.target.value);
                  }}
                  className={patternError ? "border-red-500" : ""}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="e.g., OpenAI API keys"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            {patternError && (
              <p className="text-sm text-red-500">{patternError}</p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleAddPattern}>
                <Check className="h-4 w-4 mr-2" />
                Save Pattern
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAdding(false);
                  setNewName("");
                  setNewPattern("");
                  setNewDescription("");
                  setPatternError(null);
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Patterns */}
      <Card>
        <CardHeader>
          <CardTitle>Test Patterns</CardTitle>
          <CardDescription>
            Paste text to test which patterns match
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste text containing potential API keys to test..."
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            rows={4}
          />
          <div className="flex gap-2">
            <Button onClick={handleTestPatterns}>Test Patterns</Button>
            <Button
              variant="outline"
              onClick={() => {
                setTestInput("");
                setTestResults([]);
              }}
            >
              Clear
            </Button>
          </div>
          {testResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-green-600">
                Found {testResults.reduce((acc, r) => acc + r.matches.length, 0)} matches:
              </p>
              {testResults.map((result, i) => (
                <div key={i} className="p-2 bg-muted rounded">
                  <Badge className="mb-2">{result.name}</Badge>
                  <div className="space-y-1">
                    {result.matches.map((match, j) => (
                      <code key={j} className="block text-xs bg-background p-1 rounded">
                        {match}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {testInput && testResults.length === 0 && (
            <p className="text-sm text-muted-foreground">No patterns matched</p>
          )}
        </CardContent>
      </Card>

      {/* Patterns Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Configured Patterns
            <Badge variant="secondary" className="ml-2">
              {patterns.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patterns.length === 0 && !isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No patterns configured. Add one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  patterns.map((pattern) => (
                    <TableRow key={pattern.id}>
                      <TableCell>
                        <Switch
                          checked={pattern.enabled}
                          onCheckedChange={(checked) =>
                            handleToggleEnabled(pattern.id, checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{pattern.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono max-w-[300px] block truncate">
                          {pattern.pattern}
                        </code>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {pattern.description}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(pattern.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>How Patterns Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Patterns use <strong>regular expressions (regex)</strong> to detect API keys in Moltbook posts.
          </p>
          <p>
            The scanner checks each post against all enabled patterns. When a match is found,
            it&apos;s saved to the database with the pattern type.
          </p>
          <p>
            <strong>Note:</strong> Changes to patterns here affect future scans only.
            The scanner service needs to be restarted to pick up new patterns from the database.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
