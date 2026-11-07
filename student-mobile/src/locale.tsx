import { createContext, useContext, type ReactNode } from "react";

const tamil: Record<string, string> = {
  Home: "முகப்பு",
  Exams: "தேர்வுகள்",
  Practice: "பயிற்சி",
  "AI Tutor": "AI ஆசிரியர்",
  Profile: "சுயவிவரம்",
  Accuracy: "துல்லியம்",
  "Study streak": "தொடர் பயிற்சி",
  Change: "மாற்று",
  "Your current exam": "உங்கள் தற்போதைய தேர்வு",
  "View all": "அனைத்தையும் காண்க",
  "Today's plan": "இன்றைய திட்டம்",
  Notifications: "அறிவிப்புகள்",
  "My details": "என் விவரங்கள்",
  "Edit profile": "சுயவிவரம் திருத்து",
  Settings: "அமைப்புகள்",
  Analytics: "பகுப்பாய்வு",
  Bookmarks: "சேமித்தவை",
  Notes: "குறிப்புகள்",
  Achievements: "சாதனைகள்",
  "AI memory": "AI நினைவகம்",
  "Help and support": "உதவி மற்றும் ஆதரவு",
  Logout: "வெளியேறு",
  Personal: "தனிப்பட்டவை",
  "App language": "செயலி மொழி",
  "Exam language": "தேர்வு மொழி",
  "Exam goal": "தேர்வு இலக்கு",
  Education: "கல்வி",
  Experience: "அனுபவம்",
  "Add education": "கல்வி சேர்",
  "Add experience": "அனுபவம் சேர்",
  Remove: "நீக்கு",
  "Save changes": "மாற்றங்களை சேமி",
  Cancel: "ரத்து",
  Tamil: "தமிழ்",
  English: "ஆங்கிலம்",
};

const LocaleContext = createContext({ language: "en" as "en" | "ta", t: (key: string) => key });

export function LocaleProvider({ language, children }: { language: "en" | "ta"; children: ReactNode }) {
  return (
    <LocaleContext.Provider value={{ language, t: (key) => language === "ta" ? tamil[key] || key : key }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
