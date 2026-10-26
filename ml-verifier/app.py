import os
import pickle
import re

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="NDMS ML Verifier", version="1.0.0")

MODEL_PATH = os.getenv("MODEL_PATH", "model.pkl")
ENCODER_PATH = os.getenv("ENCODER_PATH", "encoder.pkl")

try:
    with open(MODEL_PATH, "rb") as model_file:
        model = pickle.load(model_file)
    with open(ENCODER_PATH, "rb") as encoder_file:
        encoder = pickle.load(encoder_file)
    print("Successfully loaded model.pkl and encoder.pkl")
except (OSError, pickle.PickleError, EOFError, AttributeError, ImportError) as error:
    model = None
    encoder = None
    print(f"Warning: Could not load model or encoder files: {error}")


class TextInput(BaseModel):
    text: str


def clean_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"http\S+|www\S+|https\S+", "", text, flags=re.MULTILINE)
    text = re.sub(r"<.*?>", "", text)
    text = re.sub(r"[^a-z\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def predict_validity(text: str) -> bool:
    if model is None or encoder is None:
        raise HTTPException(
            status_code=503,
            detail="ML model or encoder files are not loaded on the server."
        )

    try:
        vectorized_text = encoder.transform([clean_text(text)])
        prediction = model.predict(vectorized_text)[0]
        return bool(prediction == 1)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail="Error during model inference.") from error


@app.post("/predict")
def predict(payload: TextInput) -> dict[str, bool]:
    return {"valid": predict_validity(payload.text)}


@app.get("/health")
def health() -> dict[str, str]:
    if model is None or encoder is None:
        raise HTTPException(status_code=503, detail="ML model or encoder files are not loaded.")
    return {"status": "ok"}
