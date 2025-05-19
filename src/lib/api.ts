import { toast } from "sonner";
import { API_KEY_STORAGE_KEY } from "@/pages/SettingsPage";

// Mock API base URL - in a real app, this would come from environment variables
const API_BASE_URL = "http://localhost:3001/api";
const EXTERNAL_API_BASE_URL = "http://localhost:8080";

// Helper to get API key from localStorage
const getApiKey = (showError: boolean = false): string => {
  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  
  if (!apiKey && showError) {
    toast.error("API key not configured. Please set it in the Settings page.");
  }
  
  return apiKey;
};

// Type definitions
export interface ExternalFile {
  id: string;
  object: string;
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
  status: string;
}

export interface Dataset {
  id: string;
  fileName: string;
  rowCount: number;
  language: string;
  createdAt: string;
  status: "processing" | "ready";
}

export interface ExternalFilesResponse {
  data: ExternalFile[];
  has_more: boolean;
  object: string;
}

export interface TestingCriteria {
  type: string;
  name: string;
  id: string;
  model: string;
  input: {
    role: string;
    content: string;
  }[];
}

export interface ExternalEval {
  id: string;
  object: string;
  name: string;
  created_at: number;
  data_source_config: {
    type: string;
    metadata: Record<string, any>;
  };
  testing_criteria: TestingCriteria[];
  metadata: Record<string, any>;
}

export interface ExternalEvalsResponse {
  object: string;
  data: ExternalEval[];
  has_more: boolean;
  first_id: string;
  last_id: string;
  limit: number;
}

export interface Eval {
  id: string;
  name: string;
  model: string;
  template: string;
  datasetId: string;
  variableMapping: Record<string, string>;
  createdAt: string;
}

export interface Run {
  id: string;
  evalId: string;
  name: string;
  status: "running" | "completed" | "failed";
  progress: number;
  createdAt: string;
  completedAt?: string;
}

export interface RunResult {
  runId: string;
  resultCounts: {
    passed: number;
    failed: number;
    errored: number;
  };
  level1Distribution: {
    name: string;
    value: number;
  }[];
  topLevel2Reasons: {
    name: string;
    value: number;
  }[];
}

export interface Annotation {
  id: string;
  conversationId: string;
  agent?: string;
  handoverReasonL1: string;
  handoverReasonL2: string;
  labelSelectionReason: string;
  conversation: string;
  createdAt?: number;
}

// Generic fetch wrapper with error handling
async function fetchWithErrorHandling<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: "An unknown error occurred",
      }));
      throw new Error(error.message || `HTTP error! Status: ${response.status}`);
    }

    // For endpoints that don't return JSON
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      return await response.json();
    }
    
    // For endpoints that return blobs (like file downloads)
    if (url.includes("export")) {
      return await response.blob() as unknown as T;
    }
    
    return {} as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    toast.error(message);
    throw error;
  }
}

// Generic fetch wrapper for external API
async function fetchExternalAPI<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const apiKey = getApiKey();
    
    const response = await fetch(`${EXTERNAL_API_BASE_URL}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: "An unknown error occurred",
      }));
      throw new Error(error.message || `HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    toast.error(message);
    throw error;
  }
}

// Convert external file to Dataset format
function convertExternalFileToDataset(file: ExternalFile): Dataset {
  // For now, estimate row count based on file size
  // This will be overridden with actual count when content is loaded
  const estimatedRows = Math.floor(file.bytes / 500);
  
  // Ensure we have a valid file ID
  if (!file.id) {
    console.error("External file is missing ID:", file);
  }
  
  console.log(`Converting external file to dataset: ${file.id} (${file.filename})`);
  
  return {
    id: file.id,
    fileName: file.filename,
    rowCount: estimatedRows,
    language: "English (translated)",
    createdAt: new Date(file.created_at * 1000).toISOString(),
    status: file.status === "processed" ? "ready" : "processing"
  };
}

// Convert external eval to internal format
function convertExternalEvalToEval(externalEval: ExternalEval): Eval {
  // Find the model from the testing criteria
  const model = externalEval.testing_criteria.length > 0
    ? externalEval.testing_criteria[0].model || "unknown"
    : "unknown";
  
  return {
    id: externalEval.id,
    name: externalEval.name,
    model: model,
    // These are placeholder values since they're not in the external API response
    template: "handover-taxonomy",
    datasetId: "",
    variableMapping: {},
    createdAt: new Date(externalEval.created_at * 1000).toISOString()
  };
}

// API functions

// Dataset APIs
export async function getDatasets(after?: string, limit: number = 8): Promise<Dataset[]> {
  try {
    const purpose = "evals";
    const order = "desc";
    
    // Get API key (optional)
    const apiKey = getApiKey();
    
    // Construct query URL
    let queryUrl = `/v1/files?purpose=${purpose}&limit=${limit}&order=${order}`;
    if (after) {
      queryUrl += `&after=${after}`;
    }
    
    console.log("Fetching datasets with URL:", queryUrl);
    
    // Fetch data from external API
    const response = await fetch(`${EXTERNAL_API_BASE_URL}${queryUrl}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch datasets: ${response.status}`);
    }
    
    const data = await response.json() as ExternalFilesResponse;
    
    console.log("Response has_more:", data.has_more);
    console.log("Response data length:", data.data.length);
    
    // Convert external files to Dataset format
    return data.data.map(convertExternalFileToDataset);
  } catch (error) {
    console.error("Failed to fetch datasets:", error);
    // Return empty array instead of throwing to avoid breaking the UI
    return [];
  }
}

// Eval APIs
export async function createEval(
  name: string, 
  model: string, 
  datasetId: string,
  template: string = "handover-taxonomy",
  variableMapping: Record<string, string> = {},
  promptText: string
): Promise<Eval> {
  try {
    // Format the variable mapping for the API
    // The backend expects: "fieldName1: {{item.fieldPath1}}, fieldName2: {{item.fieldPath2}}"
    // Keep the {{item.*}} format intact
    const formattedContent = Object.entries(variableMapping)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
    
    // Create the payload for the external API
    const payload = {
      name: name,
      data_source_config: {
        type: "stored_completions"
      },
      testing_criteria: [
        {
          name: "Handover taxonomy Annotator",
          type: "annotate_model",
          model: model,
          input: [
            {
              role: "developer",
              content: promptText // Use the actual prompt text from the component
            },
            {
              role: "user",
              content: formattedContent
            }
          ]
        }
      ]
    };
    
    console.log("Creating evaluation with payload:", payload);
    
    // Get the API key from localStorage - no longer required
    const apiKey = getApiKey();
    
    // Make a real API call to create the evaluation
    const response = await fetch(`${EXTERNAL_API_BASE_URL}/v1/evals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create evaluation: ${response.status}`);
    }

    // Parse the response
    const evalData = await response.json();
    
    // Convert to the internal Eval format
    return {
      id: evalData.id,
      name: evalData.name,
      model: model,
      template: template,
      datasetId: datasetId,
      variableMapping: variableMapping,
      createdAt: new Date(evalData.created_at * 1000).toISOString()
    };
  } catch (error) {
    console.error("Failed to create evaluation:", error);
    throw error;
  }
}

// Run configuration and execution APIs
export async function configureRun(evalId: string, name: string): Promise<Run> {
  // In a real app, we would post to the API
  // For now, simulate a delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Return mock data
  return {
    id: `run-${Math.random().toString(36).substring(2, 9)}`,
    evalId,
    name,
    status: "running",
    progress: 0,
    createdAt: new Date().toISOString()
  };
}

// Real API call to create a run
export async function createRun(evalId: string, name: string, datasetId: string): Promise<Run> {
  try {
    console.log(`Creating run for evaluation ${evalId} with dataset ${datasetId}`);
    
    // Get API key from localStorage - required for this call
    const apiKey = getApiKey(true);
    if (!apiKey) {
      throw new Error("API key not configured");
    }
    
    // Create the payload for the external API
    const payload = {
      name: name,
      data_source: {
        type: "stored_completions",
        source: {
          type: "file_id",
          id: datasetId
        }
      }
    };
    
    console.log("Creating run with payload:", payload);
    
    // Make the API call to create the run
    const response = await fetch(`${EXTERNAL_API_BASE_URL}/v1/evals/${evalId}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to create run: ${response.status}`);
    }
    
    // Parse the response
    const runData = await response.json();
    
    // Convert to the internal Run format
    return {
      id: runData.id,
      evalId: evalId,
      name: runData.name,
      status: "running",
      progress: 0,
      createdAt: new Date(runData.created_at * 1000).toISOString()
    };
  } catch (error) {
    console.error("Failed to create run:", error);
    throw error;
  }
}

export async function startRun(runId: string): Promise<Run> {
  // In a real app, we would post to the API
  // For now, simulate a delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Return mock data
  return {
    id: runId,
    evalId: `eval-${runId.split("-")[1]}`,
    name: "Agent handovers Taxonomy Labelling Run",
    status: "running",
    progress: 0,
    createdAt: new Date().toISOString()
  };
}

export async function checkRunStatus(runId: string): Promise<Run> {
  // In a real app, we would fetch from the API
  // For now, return mock data with increasing progress
  const previousProgress = localStorage.getItem(`run-${runId}-progress`) || "0";
  let progress = parseInt(previousProgress, 10);
  
  // Increment progress
  progress = Math.min(progress + Math.floor(Math.random() * 10) + 3, 100);
  localStorage.setItem(`run-${runId}-progress`, progress.toString());
  
  // If completed, clear progress
  if (progress >= 100) {
    localStorage.removeItem(`run-${runId}-progress`);
  }
  
  return {
    id: runId,
    evalId: `eval-${runId.split("-")[1]}`, // Mock associated eval ID
    name: "Agent handovers Taxonomy Labelling Run",
    status: progress >= 100 ? "completed" : "running",
    progress,
    createdAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
    completedAt: progress >= 100 ? new Date().toISOString() : undefined
  };
}

export async function getRunResult(runId: string): Promise<RunResult> {
  // In a real app, we would fetch from the API
  // For now, simulate a delay
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  // Level 1 reasons
  const level1Reasons = [
    "NLU_LOW_CONFIDENCE", 
    "CONTEXT_CARRYOVER_FAIL", 
    "CONTENT_GAP", 
    "USER_ESCALATION", 
    "SYSTEM_ERROR"
  ];
  
  // Generate random distribution that sums to 100
  const l1Counts = level1Reasons.map(() => Math.floor(Math.random() * 30) + 5);
  const totalL1 = l1Counts.reduce((acc, val) => acc + val, 0);
  const normalizedL1 = l1Counts.map(val => Math.floor((val / totalL1) * 100));
  
  // Ensure total is 100
  const diffL1 = 100 - normalizedL1.reduce((acc, val) => acc + val, 0);
  normalizedL1[0] += diffL1;
  
  // Level 2 reasons
  const l2Reasons = [
    "AMBIGUOUS_QUERY",
    "DOMAIN_KNOWLEDGE_GAP", 
    "INSTRUCTION_TOO_COMPLEX", 
    "MULTI_INTENT_QUERY", 
    "TASK_UNSUPPORTED", 
    "EXPLICIT_HUMAN_REQUEST", 
    "UNABLE_TO_VERIFY", 
    "ETHICAL_CONCERN"
  ];
  
  // Return mock data
  return {
    runId,
    resultCounts: {
      passed: 80,
      failed: 18,
      errored: 2
    },
    level1Distribution: level1Reasons.map((name, i) => ({
      name,
      value: normalizedL1[i]
    })),
    topLevel2Reasons: l2Reasons
      .slice(0, 5)
      .map(name => ({
        name,
        value: Math.floor(Math.random() * 20) + 5
      }))
      .sort((a, b) => b.value - a.value)
  };
}

// Annotation APIs
export async function getAnnotations(runId: string, after?: string, limit: number = 8): Promise<Annotation[]> {
  try {
    // Get API key - no longer required
    const apiKey = getApiKey();
    
    // Get the evaluation ID from localStorage
    const evalId = localStorage.getItem("lastRunEvalId");
    if (!evalId) {
      throw new Error("Evaluation ID not available for fetching annotations");
    }
    
    // Get the test criteria ID from the run details
    const runDetails = await getRunDetails(evalId, runId);
    if (!runDetails.report_url) {
      throw new Error("No report URL found in run details");
    }
    
    // Extract test criteria ID from report_url
    const parts = runDetails.report_url.split('/');
    const testCriteriaId = parts[parts.length - 1];
    if (!testCriteriaId) {
      throw new Error("Could not extract test criteria ID from report URL");
    }
    
    // Store the test criteria ID for use in update operations
    localStorage.setItem("lastTestCriteriaId", testCriteriaId);
    console.log(`Stored test criteria ID: ${testCriteriaId}`);
    
    // Construct the API URL
    let url = `${EXTERNAL_API_BASE_URL}/v1/evals/${evalId}/runs/${runId}/tests/${testCriteriaId}/annotations?limit=${limit}&order=desc`;
    if (after) {
      url += `&after=${after}`;
    }
    
    console.log(`Fetching annotations from: ${url}`);
    
    // Call the API
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch annotations: ${response.status}`);
    }
    
    // Parse the results
    const data = await response.json();
    console.log("Annotations data:", data);
    
    // Transform the data to match our interface
    return data.map((item: any) => ({
      id: item.id,
      conversationId: item.annotationAttributes.conversationId,
      handoverReasonL1: item.annotationAttributes.handover_reason_l1,
      handoverReasonL2: item.annotationAttributes.handover_reason_l2,
      labelSelectionReason: item.annotationAttributes.label_selection_reason,
      conversation: item.annotationAttributes.conversation,
      agent: item.annotationAttributes.agent,
      createdAt: item.createdAt
    }));
  } catch (error) {
    console.error("Failed to fetch annotations:", error);
    toast.error("Failed to load annotations");
    return [];
  }
}

export async function saveAnnotation(
  annotationId: string,
  updates: { handoverReasonL1?: string; handoverReasonL2?: string }
): Promise<void> {
  try {
    // Get API key - no longer required
    const apiKey = getApiKey();
    
    // Get the evaluation ID from localStorage
    const evalId = localStorage.getItem("lastRunEvalId");
    if (!evalId) {
      throw new Error("Evaluation ID not available for updating annotation");
    }
    
    // Get the run ID and test criteria ID from storage or fallback
    const runId = localStorage.getItem("lastRunId");
    if (!runId) {
      throw new Error("Run ID not available for updating annotation");
    }
    
    // Get the test criteria ID from the run details if not already available
    const testCriteriaId = localStorage.getItem("lastTestCriteriaId");
    let testId = testCriteriaId;
    
    if (!testId) {
      try {
        // Try to extract from run details
        const runDetails = await getRunDetails(evalId, runId);
        console.log("Run details for test ID extraction:", runDetails);
        
        if (runDetails.report_url) {
          // Extract the last part of the URL which should be the test criteria ID
          const parts = runDetails.report_url.split('/');
          testId = parts[parts.length - 1];
          
          console.log(`Extracted test criteria ID: ${testId}`);
          
          // Save for future use
          if (testId) {
            localStorage.setItem("lastTestCriteriaId", testId);
          }
        } else {
          console.error("No report_url found in run details");
        }
      } catch (e) {
        console.error("Failed to get test criteria ID:", e);
        throw new Error("Could not determine test criteria ID for updating annotation");
      }
    }
    
    if (!testId) {
      throw new Error("Test criteria ID not available for updating annotation");
    }
    
    // Transform updates to match API format with proper annotationAttributes wrapper
    const apiUpdates: Record<string, any> = {};
    
    if (updates.handoverReasonL1) {
      apiUpdates.handover_reason_l1 = updates.handoverReasonL1;
    }
    
    if (updates.handoverReasonL2) {
      apiUpdates.handover_reason_l2 = updates.handoverReasonL2;
    }
    
    // Don't send an update if there's nothing to update
    if (Object.keys(apiUpdates).length === 0) {
      return;
    }
    
    // Make the API call to update the annotation
    const url = `${EXTERNAL_API_BASE_URL}/v1/evals/${evalId}/runs/${runId}/tests/${testId}/annotations/${annotationId}`;
    
    console.log(`Updating annotation at: ${url}`);
    console.log("Updates:", { annotationAttributes: apiUpdates });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ 
        annotationAttributes: apiUpdates 
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("API response error:", errorText);
      throw new Error(`Failed to update annotation: ${response.status}`);
    }
    
    console.log("Annotation updated successfully");
    toast.success("Annotation updated successfully");
  } catch (error) {
    console.error("Failed to update annotation:", error);
    toast.error("Failed to update annotation");
    throw error;
  }
}

export async function exportAnnotations(runId: string, format: "xlsx" | "jsonl"): Promise<Blob> {
  try {
    console.log(`Exporting annotations for run: ${runId} in format: ${format}`);
    
    if (format === "jsonl") {
      // For backward compatibility, maintain the mock implementation for JSONL
      await new Promise(resolve => setTimeout(resolve, 1500));
      return new Blob(["Mock export data"], { type: "application/jsonl" });
    }
    
    // Get the evaluation ID from localStorage
    const evalId = localStorage.getItem("lastRunEvalId");
    if (!evalId) {
      throw new Error("Evaluation ID not available for exporting annotations");
    }
    
    // Get the test criteria ID from localStorage
    const testId = localStorage.getItem("lastTestCriteriaId");
    if (!testId) {
      throw new Error("Test criteria ID not available for exporting annotations");
    }
    
    // Make a POST request to the new export API
    const response = await fetch(`${API_BASE_URL}/v1/files/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        evalId,
        evalRundId: runId,
        testId
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Export failed with status: ${response.status}`);
    }
    
    // Return the response as a blob
    return await response.blob();
  } catch (error) {
    console.error("Failed to export annotations:", error);
    toast.error(`Failed to export annotations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

// Excel to JSONL conversion with translation
export async function convertExcelToJsonl(file: File): Promise<File> {
  const formData = new FormData();
  formData.append("file", file);

  // Debug: log form data
  console.log('Converting file:', file.name, 'Size:', file.size);
  
  try {
    // Make a real API call to convert the Excel file
    const response = await fetch(`${API_BASE_URL}/v1/files/conversion`, {
      method: 'POST',
      body: formData,
      // Do not set Content-Type header - browser will set it with the boundary parameter
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Conversion failed with status: ${response.status}`);
    }

    // Get the file content and create a new File object
    const blob = await response.blob();
    return new File([blob], file.name.replace(/\.xlsx$/, '.jsonl'), { 
      type: 'application/jsonl' 
    });
  } catch (error) {
    console.error("Excel to JSONL conversion failed:", error);
    throw error;
  }
}

// Fetch JSONL file content
export async function getFileContent(fileId: string): Promise<any[]> {
  try {
    if (!fileId) {
      console.error("No fileId provided to getFileContent");
      toast.error("Invalid file ID");
      return [];
    }

    console.log(`Fetching content for file: ${fileId}`);
    
    // Get the API key from localStorage (optional)
    const apiKey = getApiKey();
    
    // Ensure we're not using any hardcoded values
    const sanitizedFileId = fileId.trim();
    
    // Call the external API with the provided fileId
    const url = `${EXTERNAL_API_BASE_URL}/v1/files/${sanitizedFileId}/content`;
    console.log(`Making API call to: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch file content: ${response.status}`);
    }
    
    // Get the file content as text
    const text = await response.text();
    
    // Parse JSONL content (each line is a JSON object)
    const lines = text.split('\n').filter(line => line.trim());
    const parsedData = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.error("Error parsing JSONL line:", e);
        return null;
      }
    }).filter(item => item !== null);
    
    console.log(`Successfully parsed ${parsedData.length} records from file ${fileId}`);
    return parsedData;
  } catch (error) {
    console.error("Failed to fetch file content:", error);
    toast.error("Failed to load file content");
    return [];
  }
}

// Fetch evaluations
export async function getEvaluations(after?: string, limit: number = 8): Promise<Eval[]> {
  try {
    const order = "desc";
    
    // Construct query URL
    let queryUrl = `/v1/evals?limit=${limit}&order=${order}`;
    if (after) {
      queryUrl += `&after=${after}`;
    }
    
    console.log("getEvaluations called with queryUrl:", queryUrl);
    
    // Use the existing fetchExternalAPI function
    const data = await fetchExternalAPI<ExternalEvalsResponse>(queryUrl);
    
    console.log("getEvaluations response data:", data);
    console.log("Response has_more:", data.has_more);
    console.log("Response data length:", data.data.length);
    
    // Convert external evals to Eval format
    return data.data.map(convertExternalEvalToEval);
  } catch (error) {
    console.error("Failed to fetch evaluations:", error);
    // Return empty array instead of throwing to avoid breaking the UI
    return [];
  }
}

// Fetch single evaluation details
export async function getEvaluationDetails(evalId: string): Promise<ExternalEval> {
  try {
    console.log(`Fetching evaluation details for ID: ${evalId}`);
    return await fetchExternalAPI<ExternalEval>(`/v1/evals/${evalId}`);
  } catch (error) {
    console.error(`Failed to fetch evaluation details for ID ${evalId}:`, error);
    throw error;
  }
}

// Get run details using real API
export interface RunDetails {
  id: string;
  object: string;
  eval_id: string;
  name: string;
  created_at: number;
  data_source: {
    type: string;
    source: {
      type: string;
      id: string;
    };
  };
  model: string | null;
  status: "in_progress" | "completed" | "failed";
  result_counts: {
    passed: number;
    failed: number;
    errored: number;
    total: number;
  } | null;
  per_testing_criteria_results: Array<{
    testing_criteria: string;
    criterionResults: any[];
    passed: number;
    failed: number;
  }> | null;
  per_model_usage: any | null;
  report_url: string;
  metadata: Record<string, any>;
  error: string | null;
}

export async function getRunDetails(evalId: string, runId: string): Promise<RunDetails> {
  try {
    console.log(`Fetching run details for evalId: ${evalId}, runId: ${runId}`);
    
    // Get API key from localStorage - no longer required
    const apiKey = getApiKey();
    
    // The API requires both evalId and runId
    if (evalId === "unknown") {
      // Since direct run endpoint is not available, we'll need to handle this differently
      // For now, throw an error indicating we need the evalId
      throw new Error("Evaluation ID is required to fetch run details");
    }
    
    // Make the API call to fetch run details
    const url = `${EXTERNAL_API_BASE_URL}/v1/evals/${evalId}/runs/${runId}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to fetch run details: ${response.status}`);
    }
    
    // Parse the response
    const runData = await response.json();
    console.log("Run details fetched:", runData);
    
    return runData;
  } catch (error) {
    console.error("Failed to fetch run details:", error);
    throw error;
  }
}

// Get runs for a specific evaluation
export interface EvalRun {
  id: string;
  object: string;
  eval_id: string;
  name: string;
  created_at: number;
  data_source: {
    type: string;
    source: {
      type: string;
      id: string;
    }
  };
  model: string | null;
  status: "in_progress" | "completed" | "failed";
  result_counts: {
    passed: number;
    failed: number;
    errored: number;
    total: number;
  } | null;
  per_testing_criteria_results: Array<{
    testing_criteria: string;
    criterionResults: any[];
    passed: number;
    failed: number;
  }> | null;
  per_model_usage: any | null;
  report_url: string;
  metadata: Record<string, any>;
  error: string | null;
}

export interface EvalRunsResponse {
  object: string;
  data: EvalRun[];
  has_more: boolean;
  first_id: string;
  last_id: string;
  limit: number;
}

export async function getEvalRuns(
  evalId: string, 
  after?: string, 
  limit: number = 8
): Promise<EvalRun[]> {
  try {
    console.log(`Fetching runs for evaluation ${evalId}`);
    
    // Get API key - no longer required
    const apiKey = getApiKey();
    
    // Always use descending order
    const order = "desc";
    
    // Construct query URL
    let queryUrl = `/v1/evals/${evalId}/runs?limit=${limit}&order=${order}`;
    if (after) {
      queryUrl += `&after=${after}`;
    }
    
    console.log("Fetching eval runs with URL:", queryUrl);
    
    // Fetch data from external API
    const response = await fetch(`${EXTERNAL_API_BASE_URL}${queryUrl}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch eval runs: ${response.status}`);
    }
    
    const data = await response.json();
    
    // If the response is an array, return it directly
    if (Array.isArray(data)) {
      return data;
    } 
    // If it's an EvalRunsResponse object, return the data array
    else if (data.data && Array.isArray(data.data)) {
      return data.data;
    }
    // Fallback if response format is unexpected
    else {
      console.error("Unexpected response format:", data);
      return [];
    }
  } catch (error) {
    console.error(`Failed to fetch runs for evaluation ${evalId}:`, error);
    toast.error("Failed to load evaluation runs");
    return [];
  }
}

// Aggregation data types
export interface Level2Aggregation {
  name: string;
  count: number;
}

export interface Level1Aggregation {
  name: string;
  count: number;
  level2: Level2Aggregation[];
}

export interface AggregationData {
  evalId: string;
  runId: string;
  testId: string;
  annotationsCount: number;
  aggregations: Level1Aggregation[];
}

// Fetch aggregation data for a run
export async function getRunAggregation(
  runId: string, 
  evalId?: string
): Promise<AggregationData | null> {
  try {
    // API key no longer required
    const apiKey = getApiKey();
    
    // If evalId is not provided, try to fetch it from localStorage
    if (!evalId) {
      evalId = localStorage.getItem("lastRunEvalId") || undefined;
      if (!evalId) {
        console.error("Evaluation ID not available for fetching aggregation data");
        toast.error("Could not fetch aggregation data: missing evaluation ID");
        return null;
      }
    }
    
    // First, get run details to extract the test criteria ID
    const runDetails = await getRunDetails(evalId, runId);
    
    // Check if we have test criteria ID in the report_url
    if (!runDetails.report_url) {
      throw new Error("No report URL found in run details");
    }
    
    // Extract test criteria ID from report_url
    // Usually in format "database://runId/testCriteriaId"
    const testCriteriaId = runDetails.report_url.split('/').pop();
    if (!testCriteriaId) {
      throw new Error("Could not extract test criteria ID from report URL");
    }
    
    // Now fetch the aggregation data
    const url = `${EXTERNAL_API_BASE_URL}/v1/evals/${evalId}/runs/${runId}/tests/${testCriteriaId}/annotations/aggregation`;
    
    console.log(`Fetching aggregation data from: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {})
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch aggregation data: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("Aggregation data:", data);
    
    return data as AggregationData;
  } catch (error) {
    console.error("Failed to fetch aggregation data:", error);
    toast.error("Failed to load aggregation data");
    return null;
  }
}

// Generic label and Domain label interfaces
export interface GenericLabel {
  path: string;
  count: number;
}

export interface DomainLabelSuggestion {
  suggestion: string;
  confidence: number;
  examples: string[];
  definition?: string;
  reason?: string;
  clusterId?: string;
  originalLabel?: any;
  originalCluster?: any;
  existing?: boolean;
}

// Get generic labels
export async function getGenericLabels(): Promise<GenericLabel[]> {
  try {
    return await fetchExternalAPI<GenericLabel[]>('/v1/buckets/labels/generic');
  } catch (error) {
    console.error("Failed to fetch generic labels:", error);
    throw error;
  }
}

// Get domain label suggestions
export async function getDomainLabelSuggestions(
  bucketPath: string,
  model: string
): Promise<{suggestions: DomainLabelSuggestion[], rawResponse: any}> {
  try {
    // Get API key for authorization
    const apiKey = getApiKey(true);
    if (!apiKey) {
      throw new Error("API key is required for domain label suggestions");
    }

    console.log(`Requesting domain label suggestions for bucket: ${bucketPath} with model: ${model}`);

    // Make a direct fetch call with more control over response handling
    const response = await fetch(`${EXTERNAL_API_BASE_URL}/v1/buckets/labels/suggest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        bucketPath,
        model
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("API error response:", errorText);
      throw new Error(`Failed to fetch domain suggestions: ${response.status} ${response.statusText}`);
    }

    // Get the raw response
    const responseData = await response.json();
    console.log("Domain suggestion API raw response:", responseData);

    // Format the response structure into our DomainLabelSuggestion[] format
    const suggestions: DomainLabelSuggestion[] = [];

    // The actual response is an object with numeric keys (cluster IDs)
    // Each cluster has a suggestedLabels array and exampleIds array
    if (responseData && typeof responseData === 'object') {
      // Loop through each cluster in the response
      Object.keys(responseData).forEach(clusterId => {
        const cluster = responseData[clusterId];
        
        // If this cluster has suggestedLabels, process them
        if (cluster && cluster.suggestedLabels && Array.isArray(cluster.suggestedLabels)) {
          cluster.suggestedLabels.forEach(label => {
            // Get the examples for this cluster
            const examples = Array.isArray(cluster.exampleIds) ? cluster.exampleIds : [];
            
            // Convert confidence from string (HIGH, MEDIUM, LOW) to number
            let confidenceValue = 0.5; // Default medium confidence
            if (label.confidence === "HIGH") {
              confidenceValue = 0.9;
            } else if (label.confidence === "MEDIUM") {
              confidenceValue = 0.5;
            } else if (label.confidence === "LOW") {
              confidenceValue = 0.1;
            }
            
            // Store original label object and cluster data for later use with the accept API
            const rawClusterData = {
              ...cluster.cluster,
              // Ensure we have the ID from the object key if not in the cluster object
              id: cluster.cluster?.id || clusterId
            };
            
            // Add to our suggestions array
            suggestions.push({
              suggestion: label.path || "Unknown label",
              confidence: confidenceValue,
              examples: examples,
              // Add additional properties that might be useful to display
              definition: label.definition || "",
              reason: label.reason || "",
              clusterId: clusterId,
              // Store the original objects for the accept API
              originalLabel: label,
              originalCluster: rawClusterData,
              // Add the existing flag
              existing: label.existing || false
            });
          });
        }
      });
    }

    console.log(`Processed ${suggestions.length} domain label suggestions`);
    // Return both the processed suggestions and the raw response
    return { 
      suggestions, 
      rawResponse: responseData 
    };
  } catch (error) {
    console.error("Failed to fetch domain label suggestions:", error);
    throw error;
  }
}

// Accept a domain label suggestion
export interface ClusterData {
  id: number | string;
  indices: number[];
  conversationIds: string[];
}

export interface SuggestedLabel {
  path: string;
  definition: string;
  confidence: string;
  reason: string;
}

// Interface for domain label rule
export interface DomainLabelRule {
  id: string;
  label: string;
  bucketPath: string;
  definition: string;
  reason: string;
  version: string;
  author: string;
  createdAt: string;
}

// Get existing domain labels
export async function getDomainLabels(): Promise<DomainLabelRule[]> {
  try {
    return await fetchExternalAPI<DomainLabelRule[]>('/v1/buckets/labels/domain');
  } catch (error) {
    console.error("Failed to fetch domain labels:", error);
    throw error;
  }
}

export async function acceptDomainLabel(
  bucketPath: string, 
  suggestedLabel: SuggestedLabel,
  cluster: ClusterData,
  author?: string
): Promise<void> {
  try {
    // Get API key for authorization
    const apiKey = getApiKey(true);
    if (!apiKey) {
      throw new Error("API key is required to accept domain label");
    }

    console.log(`Accepting domain label ${suggestedLabel.path} for bucket ${bucketPath}`);

    const response = await fetch(`${EXTERNAL_API_BASE_URL}/v1/labels/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        bucketPath,
        suggestedLabel,
        cluster,
        author: author || "unknown"
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("API error response:", errorText);
      throw new Error(`Failed to accept domain label: ${response.status} ${response.statusText}`);
    }

    console.log("Domain label accepted successfully");
  } catch (error) {
    console.error("Failed to accept domain label:", error);
    throw error;
  }
}

// Domain Label Dashboard Types
export interface DomainLabelDateCount {
  day: string;
  count: number;
}

export interface DomainLabelBucket {
  path: string;
  count: number;
  dateWise: DomainLabelDateCount[];
}

export interface DomainLabelCategory {
  path: string;
  count: number;
  buckets: DomainLabelBucket[];
  dateWise: DomainLabelDateCount[];
}

export interface DomainLabelAggregationResponse {
  count: number;
  domains: DomainLabelCategory[];
}

// Get domain label aggregation for dashboard
export async function getDomainLabelAggregation(): Promise<DomainLabelAggregationResponse> {
  try {
    const apiKey = getApiKey(true);
    if (!apiKey) {
      throw new Error("API key is required for domain label aggregation");
    }

    const response = await fetch(`${EXTERNAL_API_BASE_URL}/v1/dashboard/domains/aggregation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("API error response:", errorText);
      throw new Error(`Failed to fetch domain label aggregation: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Domain label aggregation data:", data);
    return data;
  } catch (error) {
    console.error("Failed to fetch domain label aggregation:", error);
    throw error;
  }
}

// Conversation types for transcript viewing
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  name?: string;
  timestamp?: string;
}

export interface Conversation {
  id: string;
  messages: Message[];
  metadata?: {
    created_at?: string;
    model?: string;
    [key: string]: any;
  };
}

export interface ConversationListResponse {
  data: Conversation[];
  has_more: boolean;
  last_id?: string;
}

// Fetch conversation transcripts for a domain label
export async function getConversationTranscripts(
  domainLabel: string,
  limit: number = 10,
  after?: string
): Promise<ConversationListResponse> {
  try {
    const apiKey = getApiKey(true);
    if (!apiKey) {
      throw new Error("API key is required to fetch conversations");
    }

    // Build the URL with query parameters
    let url = `${EXTERNAL_API_BASE_URL}/v1/conversations/transcripts?limit=${limit}&domainLabel=${encodeURIComponent(domainLabel)}`;
    if (after) {
      url += `&after=${encodeURIComponent(after)}`;
    }

    console.log(`Fetching conversations from: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("API error response:", errorText);
      throw new Error(`Failed to fetch conversations: ${response.status} ${response.statusText}`);
    }

    const rawData = await response.json();
    console.log(`Received raw API response:`, rawData);
    
    // Transform the API response to match our expected structure
    const transformedData: Conversation[] = (rawData || []).map((conversation: any) => {
      // Transform the messages to match our expected structure
      const messages: Message[] = (conversation.messages || []).map((msg: any) => {
        return {
          // Convert API's uppercase roles to lowercase to match our interface
          role: (msg.role || "").toLowerCase() as "user" | "assistant" | "system",
          content: msg.text || "", // API uses 'text' instead of 'content'
          timestamp: msg.timestamp || undefined
        };
      });

      return {
        id: conversation.conversationId || "",
        messages: messages,
        metadata: {
          created_at: conversation.createdAt || undefined,
          model: conversation.model || undefined,
          isGenericLabelAvailable: conversation.isGenericLabelAvailable
        }
      };
    });
    
    // For pagination, we use the ID of the last conversation as the cursor
    const lastId = transformedData.length > 0 ? 
      transformedData[transformedData.length - 1].id : 
      undefined;
      
    console.log(`Last conversation ID (for pagination): ${lastId}`);
    
    // Determine if there are more results
    // We'll use the array length compared to the limit as a heuristic
    // If we received exactly the number we asked for, there's likely more
    const hasMore = transformedData.length >= limit;
    
    const responseData: ConversationListResponse = {
      data: transformedData,
      has_more: hasMore,
      last_id: lastId
    };
    
    console.log(`Transformed ${transformedData.length} conversations, has_more: ${hasMore}`);
    
    return responseData;
  } catch (error) {
    console.error("Failed to fetch conversation transcripts:", error);
    throw error;
  }
}
