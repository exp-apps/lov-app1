import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createRun, getEvaluationDetails } from "@/lib/api";
import { toast } from "sonner";
import { Loader } from "lucide-react";

export default function ConfigureRunPage() {
  const { evalId } = useParams<{ evalId: string }>();
  const navigate = useNavigate();
  
  const [runName, setRunName] = useState("Agent Handovers Taxonomy Labelling Run");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [datasetId, setDatasetId] = useState("open-responses-file_6814b9e257e797000001.jsonl");
  const [evalName, setEvalName] = useState("");

  useEffect(() => {
    // Fetch evaluation details to get the dataset ID
    const fetchEvalDetails = async () => {
      if (!evalId) return;
      
      try {
        setIsLoading(true);
        const details = await getEvaluationDetails(evalId);
        setEvalName(details.name);
        
        // Set dataset ID if found in the evaluation details
        if (details.data_source_config?.metadata?.dataset_id) {
          setDatasetId(details.data_source_config.metadata.dataset_id);
        }
      } catch (error) {
        console.error("Failed to fetch evaluation details:", error);
        toast.error("Failed to load evaluation details. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchEvalDetails();
  }, [evalId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!evalId) {
      toast.error("Missing evaluation ID");
      return;
    }
    
    if (!runName.trim()) {
      toast.error("Please enter a run name");
      return;
    }

    setIsSubmitting(true);
    try {
      // Call the real API to create a run
      const runData = await createRun(evalId, runName, datasetId);
      toast.success("Run started successfully!");
      
      // Store evalId and runId in localStorage for the RunMonitorPage
      localStorage.setItem("lastRunEvalId", evalId);
      localStorage.setItem("lastRunId", runData.id);
      
      // Navigate to run monitor page
      navigate(`/runs/${runData.id}`);
    } catch (error) {
      console.error("Failed to start run:", error);
      toast.error("Failed to start run. Please check your API key and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="Start Run"
      description={`Start a new run for "${evalName}"`}
    >
      <div className="max-w-2xl mx-auto">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Run Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="h-6 w-6 animate-spin mr-2" />
                <span>Loading evaluation details...</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="run-name">Run Name</Label>
                  <Input
                    id="run-name"
                    value={runName}
                    onChange={(e) => setRunName(e.target.value)}
                    required
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader className="mr-2 h-4 w-4 animate-spin" /> Starting Run...
                      </>
                    ) : (
                      "Start Run"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(-1)}
                  >
                    Back
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
