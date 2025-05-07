import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent
} from "@/components/ui/collapsible";
import { Annotation, getAnnotations, saveAnnotation, exportAnnotations } from "@/lib/api";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Download, Edit, Save } from "lucide-react";
import taxonomyData from "@/lib/taxonomy.json";

// Interface for taxonomy data
interface TaxonomyLevel2 {
  name: string;
}

interface TaxonomyLevel1 {
  name: string;
  level2: TaxonomyLevel2[];
}

// Simple markdown content renderer
const MarkdownContent = ({ content }: { content: string }) => {
  // Replace markdown bold text with HTML bold and add styling
  const htmlContent = content
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-primary font-bold">$1</strong>')
    // Add new line handling
    .replace(/\n\n/g, '<br /><br />');
  
  return (
    <div 
      dangerouslySetInnerHTML={{ __html: htmlContent }} 
      className="markdown-content"
    />
  );
};

// Get all level 1 reason names from the taxonomy
const l1Reasons = taxonomyData.map((item: TaxonomyLevel1) => item.name);

// Color coding for L1 reasons (monochromatic colors)
const l1Colors: Record<string, string> = {
  NLU_LOW_CONFIDENCE: "bg-neutral-800 text-white",
  CONTEXT_CARRYOVER_FAIL: "bg-neutral-700 text-white",
  CONTENT_GAP: "bg-neutral-600 text-white",
  USER_ESCALATION: "bg-neutral-500 text-white",
  SYSTEM_ERROR: "bg-neutral-900 text-white",
};

// Helper function to parse conversation JSON string and format it
const parseConversation = (conversationStr: string): string => {
  try {
    // The conversation may be in different formats - try to detect and handle
    let conversationData;
    
    // Common pattern for conversation format
    if (conversationStr.startsWith('[') && conversationStr.endsWith(']')) {
      // First, handle the most common case with single quotes
      const singleQuoteRegex = /\[\s*(\{[^}]*'role'\s*:\s*'([^']*)'\s*,\s*'content'\s*:\s*'([^']*)'\s*\}(?:\s*,\s*\{[^}]*'role'\s*:\s*'([^']*)'\s*,\s*'content'\s*:\s*'([^']*)'\s*\})*)\s*\]/;
      
      if (singleQuoteRegex.test(conversationStr)) {
        // Extract content using regex for single-quoted format
        const extractRegex = /'role'\s*:\s*'([^']*)'\s*,\s*'content'\s*:\s*'([^']*)'/g;
        const matches = Array.from(conversationStr.matchAll(extractRegex));
        
        if (matches.length > 0) {
          conversationData = matches.map(match => ({
            role: match[1],
            content: match[2].replace(/\\'/g, "'")  // Handle escaped single quotes
          }));
        }
      } else {
        // Try to parse as JSON array with different approaches
        try {
          // First try standard JSON parse
          conversationData = JSON.parse(conversationStr);
        } catch (e) {
          // If that fails, try replacing single quotes with double quotes
          try {
            // Replace single quotes with double quotes, but be careful with nested quotes
            const fixedStr = conversationStr
              .replace(/\[\s*\{/g, '[{')
              .replace(/\}\s*\]/g, '}]')
              .replace(/\}\s*,\s*\{/g, '},{')
              .replace(/'/g, '"')
              .replace(/"([^"]+)":\s*"([^"]*)"/g, (match, p1, p2) => {
                // Fix double quotes inside content (escape them)
                return `"${p1}": "${p2.replace(/"/g, '\\"')}"`;
              });
            
            conversationData = JSON.parse(fixedStr);
          } catch (e2) {
            console.error("All parsing attempts failed:", e2);
            console.log("Original conversation string:", conversationStr);
          }
        }
      }
      
      // Format as "role: content" with bold role
      if (Array.isArray(conversationData)) {
        return conversationData.map((turn: any) => 
          `**${turn.role}**: ${turn.content}`
        ).join('\n\n');
      }
    }
    
    // If not a recognized format or parsing failed, return as is
    return conversationStr;
  } catch (error) {
    console.error("Error parsing conversation:", error);
    return conversationStr; // Return original if parsing fails
  }
};

// Helper to get available L1 reasons, including any custom values from API
const getAvailableL1Reasons = (annotations: Annotation[]): string[] => {
  const customL1Reasons = annotations
    .map(a => a.handoverReasonL1)
    .filter(l1 => !l1Reasons.includes(l1));
  
  // Add any custom L1 reasons to our predefined list
  return [...l1Reasons, ...new Set(customL1Reasons)];
};

// Helper to get L2 reasons for a given L1
const getL2ReasonsForL1 = (l1: string): string[] => {
  const category = taxonomyData.find((item: TaxonomyLevel1) => item.name === l1);
  if (category) {
    return category.level2.map(item => item.name);
  }
  return [];
};

export default function AnnotationReviewPage() {
  const { runId } = useParams<{ runId: string }>();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [filteredAnnotations, setFilteredAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterL1, setFilterL1] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [lastAnnotationId, setLastAnnotationId] = useState<string | undefined>(undefined);
  const [hasMoreAnnotations, setHasMoreAnnotations] = useState(true);
  const [editingAnnotation, setEditingAnnotation] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchAnnotations = async () => {
      if (!runId) return;
      
      try {
        setLoading(true);
        
        // Store runId in localStorage for later use in API calls
        localStorage.setItem("lastRunId", runId);
        
        // Try to extract the evalId from the URL or use it from localStorage
        const path = window.location.pathname;
        const evalIdMatch = path.match(/\/evals\/(.*?)\/runs/);
        if (evalIdMatch && evalIdMatch[1]) {
          const evalId = evalIdMatch[1];
          console.log(`Found evalId from URL: ${evalId}`);
          localStorage.setItem("lastRunEvalId", evalId);
        } else {
          console.log("Couldn't find evalId in URL, using value from localStorage");
        }
        
        // Log stored IDs for debugging
        console.log("API IDs in localStorage:", {
          evalId: localStorage.getItem("lastRunEvalId"),
          runId: localStorage.getItem("lastRunId"),
          testCriteriaId: localStorage.getItem("lastTestCriteriaId")
        });
        
        const data = await getAnnotations(runId);
        
        if (data.length > 0) {
          setAnnotations(data);
          setFilteredAnnotations(data);
          setLastAnnotationId(data[data.length - 1].id);
          setHasMoreAnnotations(data.length >= 8); // Assuming default limit is 8
        } else {
          setHasMoreAnnotations(false);
        }
      } catch (error) {
        console.error("Failed to fetch annotations:", error);
        toast.error("Failed to load annotations");
      } finally {
        setLoading(false);
      }
    };

    fetchAnnotations();
  }, [runId]);

  const loadMoreAnnotations = async () => {
    if (!runId || !lastAnnotationId || !hasMoreAnnotations) return;
    
    try {
      setLoading(true);
      const moreData = await getAnnotations(runId, lastAnnotationId);
      
      if (moreData.length > 0) {
        setAnnotations(prev => [...prev, ...moreData]);
        setLastAnnotationId(moreData[moreData.length - 1].id);
        setHasMoreAnnotations(moreData.length >= 8); // Assuming default limit is 8
      } else {
        setHasMoreAnnotations(false);
      }
    } catch (error) {
      console.error("Failed to fetch more annotations:", error);
      toast.error("Failed to load more annotations");
    } finally {
      setLoading(false);
    }
  };

  // Apply filters and search
  useEffect(() => {
    let filtered = [...annotations];
    
    // Apply L1 reason filter
    if (filterL1 !== "all") {
      filtered = filtered.filter(a => a.handoverReasonL1 === filterL1);
    }
    
    // Apply search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        a =>
          a.conversationId.toLowerCase().includes(term) ||
          a.conversation.toLowerCase().includes(term) ||
          a.handoverReasonL1.toLowerCase().includes(term) ||
          a.handoverReasonL2.toLowerCase().includes(term)
      );
    }
    
    setFilteredAnnotations(filtered);
  }, [annotations, filterL1, searchTerm]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const startEditing = (id: string) => {
    setEditingAnnotation(id);
  };

  const stopEditing = () => {
    setEditingAnnotation(null);
  };

  const handleL1Change = async (annotationId: string, l1: string) => {
    // Get the possible L2 reasons for the selected L1
    const l2Options = getL2ReasonsForL1(l1);
    const newL2 = l2Options.length > 0 ? l2Options[0] : "";
    
    console.log(`Updating L1 to "${l1}" and L2 to "${newL2}" for annotation ${annotationId}`);
    
    // Update UI immediately
    const updatedAnnotations = annotations.map(a => {
      if (a.id === annotationId) {
        return { 
          ...a, 
          handoverReasonL1: l1,
          handoverReasonL2: newL2
        };
      }
      return a;
    });
    
    setAnnotations(updatedAnnotations);
    
    // Save to API
    setSavingId(annotationId);
    try {
      await saveAnnotation(annotationId, { 
        handoverReasonL1: l1,
        handoverReasonL2: newL2
      });
      console.log(`Successfully updated annotation ${annotationId} with L1=${l1}, L2=${newL2}`);
      toast.success("Handover Bucket updated");
      stopEditing(); // Close editing mode after successful save
    } catch (error) {
      console.error("Failed to update annotation:", error);
      toast.error("Failed to update Handover Bucket");
    } finally {
      setSavingId(null);
    }
  };

  const handleL2Change = async (annotationId: string, l2: string) => {
    console.log(`Updating L2 to "${l2}" for annotation ${annotationId}`);
    
    // Update UI immediately
    const updatedAnnotations = annotations.map(a => {
      if (a.id === annotationId) {
        return { ...a, handoverReasonL2: l2 };
      }
      return a;
    });
    
    setAnnotations(updatedAnnotations);
    
    // Save to API
    setSavingId(annotationId);
    try {
      await saveAnnotation(annotationId, { handoverReasonL2: l2 });
      console.log(`Successfully updated annotation ${annotationId} with L2=${l2}`);
      toast.success("Handover Cause updated");
      stopEditing(); // Close editing mode after successful save
    } catch (error) {
      console.error("Failed to update annotation:", error);
      toast.error("Failed to update Handover Cause");
    } finally {
      setSavingId(null);
    }
  };

  const handleExport = async (format: "xlsx" | "jsonl") => {
    if (!runId) return;
    
    setExporting(true);
    try {
      const blob = await exportAnnotations(runId, format);
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `handover-annotations-${runId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast.success(`${format.toUpperCase()} exported successfully`);
    } catch (error) {
      console.error("Failed to export:", error);
      toast.error(`Failed to export ${format.toUpperCase()}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageContainer
      title="Annotation Review"
      description="Review and edit taxonomy annotations"
    >
      <div className="flex flex-wrap gap-4 mb-6">
        <Input
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-64"
        />
        <div className="flex gap-2 ml-auto">
          <Select value={filterL1} onValueChange={setFilterL1}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buckets</SelectItem>
              {getAvailableL1Reasons(annotations).map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && annotations.length === 0 ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filteredAnnotations.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Conversation ID</TableHead>
                <TableHead>Handover Bucket</TableHead>
                <TableHead>Handover Cause</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAnnotations.map((annotation) => (
                <React.Fragment key={annotation.id}>
                  <TableRow className="group">
                    <TableCell className="font-medium">
                      {annotation.conversationId}
                    </TableCell>
                    <TableCell>
                      {editingAnnotation === annotation.id ? (
                        <Select
                          value={annotation.handoverReasonL1}
                          onValueChange={(value) => handleL1Change(annotation.id, value)}
                          onOpenChange={(open) => !open && stopEditing()}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {taxonomyData.map((item: TaxonomyLevel1) => (
                              <SelectItem key={item.name} value={item.name}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span 
                            className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium ${l1Colors[annotation.handoverReasonL1] || "bg-neutral-700 text-white"}`}
                            onClick={() => startEditing(annotation.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            {annotation.handoverReasonL1}
                          </span>
                          {savingId === annotation.id && (
                            <span className="text-xs text-muted-foreground">Saving...</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingAnnotation === annotation.id ? (
                        <Select
                          value={annotation.handoverReasonL2}
                          onValueChange={(value) => handleL2Change(annotation.id, value)}
                          onOpenChange={(open) => !open && stopEditing()}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getL2ReasonsForL1(annotation.handoverReasonL1).map((reason) => (
                              <SelectItem key={reason} value={reason}>
                                {reason}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span 
                          onClick={() => startEditing(annotation.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          {annotation.handoverReasonL2}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRow(annotation.id)}
                          className="gap-1"
                        >
                          {expandedRows[annotation.id] ? "Hide" : "View"} 
                          <ChevronDown className={`h-4 w-4 transition-transform ${expandedRows[annotation.id] ? "transform rotate-180" : ""}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(annotation.id)}
                          className="gap-1"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  
                  {/* Full-width content when expanded */}
                  {expandedRows[annotation.id] && (
                    <TableRow>
                      <TableCell colSpan={4} className="p-0">
                        <div className="p-4 bg-muted/50">
                          <div>
                            <div className="mb-4">
                              <label className="text-sm font-medium mb-1 block">
                                Annotation Reasoning
                              </label>
                              <div className="text-sm italic text-muted-foreground">
                                {annotation.labelSelectionReason}
                              </div>
                            </div>
                            
                            <label className="text-sm font-medium">
                              Conversation
                            </label>
                            <div className="mt-1 whitespace-pre-wrap rounded bg-muted p-3 text-sm font-mono overflow-y-auto max-h-96 h-auto">
                              <MarkdownContent content={parseConversation(annotation.conversation)} />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No matching annotations found</p>
        </div>
      )}
      
      {hasMoreAnnotations && (
        <div className="mt-4 text-center">
          <Button 
            variant="outline" 
            onClick={loadMoreAnnotations}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load More"}
          </Button>
        </div>
      )}
      
      <div className="mt-6 flex gap-2 justify-end">
        <Button
          variant="outline"
          onClick={() => handleExport("jsonl")}
          disabled={exporting || annotations.length === 0}
        >
          Export JSONL
        </Button>
        <Button
          variant="outline"
          onClick={() => handleExport("xlsx")}
          disabled={exporting || annotations.length === 0}
        >
          Export Excel
        </Button>
      </div>
    </PageContainer>
  );
}
