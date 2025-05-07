import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Google Translate API wrapper
export async function translateText(text: string, targetLang: string = 'en'): Promise<string> {
  try {
    // This would use the actual Google Translate API in production
    // For demo purposes, we'll simulate a translation response
    
    // In a real implementation:
    // const url = "https://translation.googleapis.com/language/translate/v2";
    // const params = {
    //   q: text,
    //   target: targetLang,
    //   format: "text",
    //   key: process.env.GOOGLE_API_KEY
    // };
    // const response = await fetch(url, {
    //   method: 'POST',
    //   body: JSON.stringify(params),
    //   headers: {
    //     'Content-Type': 'application/json'
    //   }
    // });
    
    // Simulate API call with a delay
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    
    // For demo, just return the original text (assuming it's already English)
    // In a real implementation, we would parse the response and extract the translated text
    return text;
  } catch (error) {
    console.error("Translation error:", error);
    throw new Error("Failed to translate text");
  }
}

// Function to detect if text is not in English
export function detectNonEnglishText(text: string): boolean {
  // This is a simplified detection - in a real implementation, use a proper language detection library
  // For demo purposes, we'll assume all text needs translation
  // In reality, you would use something like the Google Cloud Language Detection API
  
  // This regex checks for common non-ASCII characters that might indicate non-English text
  const nonEnglishPattern = /[^\x00-\x7F]+/;
  return nonEnglishPattern.test(text);
}
