"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Key,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Finding {
  id: string;
  post_id: string;
  post_title: string;
  author_name: string;
  submolt_name: string;
  api_key: string;
  api_key_type: string;
  content: string;
  post_url: string;
  found_at: string;
  post_created_at: string;
}

interface Stats {
  total_findings: number;
  scanned_messages: number;
  by_type: { api_key_type: string; count: number }[];
}

const PAGE_SIZE = 25;

export default function FindingsPage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch("/api/findings?stats=true");
      const data = await response.json();
      if (data.success) {
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

  const loadFindings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/findings?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
      );
      const data = await response.json();
      if (data.success) {
        setFindings(data.findings);
        setTotal(data.total);
      } else {
        setError(data.error || "Failed to load findings");
      }
    } catch (err) {
      setError("Failed to connect to server");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadStats();
    loadFindings();
  }, [loadStats, loadFindings]);

  const handleRefresh = () => {
    loadStats();
    loadFindings();
  };

  const toggleRevealKey = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 12) return "••••••••••••";
    return key.slice(0, 8) + "••••••••" + key.slice(-4);
  };

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      OpenAI: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      Anthropic: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      Google: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      AWS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      GitHub: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      Stripe: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
      Slack: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
      Moltbook: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return colors[type] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="h-6 w-6" />
            API Key Findings
          </h1>
          <p className="text-muted-foreground">
            Exposed API keys found in Moltbook posts
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Findings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_findings}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Messages Scanned
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.scanned_messages}</div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                By Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {stats.by_type.map((item) => (
                  <Badge key={item.api_key_type} variant="secondary">
                    {item.api_key_type}: {item.count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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

      {/* Findings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Findings</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>API Key</TableHead>
                  <TableHead>Post</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Found</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.length === 0 && !isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No findings yet. The scanner is looking for exposed API keys.
                    </TableCell>
                  </TableRow>
                ) : (
                  findings.map((finding) => (
                    <TableRow key={finding.id}>
                      <TableCell>
                        <Badge className={getTypeBadgeColor(finding.api_key_type)}>
                          {finding.api_key_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                            {revealedKeys.has(finding.id)
                              ? finding.api_key
                              : maskApiKey(finding.api_key)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleRevealKey(finding.id)}
                          >
                            {revealedKeys.has(finding.id) ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate" title={finding.post_title}>
                          {finding.post_title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          m/{finding.submolt_name}
                        </div>
                      </TableCell>
                      <TableCell>{finding.author_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(finding.found_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <a
                            href={finding.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
