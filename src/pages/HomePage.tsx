
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/PageContainer";
import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function HomePage() {
  return (
    <PageContainer className="max-w-4xl mx-auto">
      <div className="flex flex-col items-center text-center py-12 space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">
          Agent-Handover Taxonomy Labeller
        </h1>
        <p className="text-xl text-muted-foreground max-w-[42rem]">
          Analyze and categorize agent handovers with AI-powered taxonomy labelling
        </p>
        <div className="flex gap-4 mt-6">
          <Button asChild size="lg">
            <Link to="/upload">Upload Dataset</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/datasets">View Library</Link>
          </Button>
        </div>
      </div>

      <div className="mt-12 pt-8 border-t">
        <h2 className="text-2xl font-bold mb-6">How It Works</h2>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="upload">
            <AccordionTrigger>1. Upload & Translate</AccordionTrigger>
            <AccordionContent>
              Upload your chat transcripts in Excel or JSONL format. Our system will automatically detect the language and convert the data to JSONL format for processing.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="configure">
            <AccordionTrigger>2. Configure Evaluation</AccordionTrigger>
            <AccordionContent>
              Set up your evaluation parameters including selecting the model (GPT-4.1, etc.) and choosing the dataset to analyze.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="run">
            <AccordionTrigger>3. Run Analysis</AccordionTrigger>
            <AccordionContent>
              Launch the evaluation run and monitor progress in real-time. Our system will process each conversation and assign Level-1 and Level-2 handover reason codes.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="results">
            <AccordionTrigger>4. Review Results</AccordionTrigger>
            <AccordionContent>
              View comprehensive dashboards showing the distribution of handover reasons. Explore visual charts and download detailed reports for further analysis.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="annotate">
            <AccordionTrigger>5. Review & Refine</AccordionTrigger>
            <AccordionContent>
              Manually review and edit annotations if needed. Export the final results to Excel or JSONL format for integration with your existing workflows.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </PageContainer>
  );
}
