import pandas as pd
import numpy as np
import re
import pickle
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

# ==========================================
# 1. LOAD DATA
# ==========================================
df = pd.read_csv('dataset.csv')

print("Dataset Shape:", df.shape)
print("Class Distribution:\n", df['target'].value_counts())

# ==========================================
# 2. TEXT PREPROCESSING
# ==========================================
def clean_text(text):
    if not isinstance(text, str):
        return ""
    # Convert to lowercase
    text = text.lower()
    # Remove URLs
    text = re.sub(r'http\S+|www\S+|https\S+', '', text, flags=re.MULTILINE)
    # Remove HTML tags
    text = re.sub(r'<.*?>', '', text)
    # Remove punctuations, special characters, and numbers (keeping only letters and spaces)
    text = re.sub(r'[^a-z\s]', '', text)
    # Remove extra whitespaces
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# Apply preprocessing to the text column
df['clean_text'] = df['text'].apply(clean_text)

# Define features (X) and target (y)
X = df['clean_text']
y = df['target']

# Split data into training and testing sets (80% train, 20% test)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# ==========================================
# 3. FEATURE EXTRACTION (ENCODER)
# ==========================================
# Using TF-IDF Vectorizer to convert text tokens into numerical vectors
vectorizer = TfidfVectorizer(max_features=5000, stop_words='english')

X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)

# ==========================================
# 4. MODEL TRAINING
# ==========================================
model = LogisticRegression(random_state=42, max_iter=1000)
model.fit(X_train_vec, y_train)

# ==========================================
# 5. MODEL EVALUATION
# ==========================================
y_pred = model.predict(X_test_vec)

print("\n--- Model Evaluation Metrics ---")
print(f"Accuracy Score: {accuracy_score(y_test, y_pred):.4f}\n")
print("Classification Report:")
print(classification_report(y_test, y_pred))
print("Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))

# ==========================================
# 6. SAVE MODEL AND ENCODER TO .PKL FILES
# ==========================================
with open('model.pkl', 'wb') as model_file:
    pickle.dump(model, model_file)

with open('encoder.pkl', 'wb') as encoder_file:
    pickle.dump(vectorizer, encoder_file)

print("\nSuccess! Files saved as 'model.pkl' and 'encoder.pkl'.")