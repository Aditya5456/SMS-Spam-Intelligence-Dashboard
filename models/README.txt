MODELS FOLDER
=============

The trained models (TF-IDF vectorizer, Support Vector Machine and the
Bayesian Logistic Regression posterior) are kept in the Flask server's
memory. They are retrained automatically:

  * when the server starts (on the sample dataset),
  * when a new CSV is uploaded,
  * when "Reset to sample dataset" is clicked,
  * when you retrain a model with new settings on the website.

Training on the full Kaggle dataset takes only a few seconds, so no large
model files are saved or committed to GitHub. This folder exists so the
project structure matches the documentation; it intentionally contains no
binary model files.
