# SMS Spam Intelligence Dashboard

**Support Vector Machines for SMS Spam Detection in Telecommunications** — Machine Learning, Unit 2 Project

A full-stack web application (Flask backend + HTML/CSS/vanilla JavaScript frontend) that trains a **Support Vector Machine** to classify SMS messages as **ham** (legitimate) or **spam**, compares it with **Bayesian Logistic Regression** (MAP + Laplace approximation), and includes separate demonstrations of **linear, robust, polynomial, ridge and Bayesian linear regression** from the Unit-2 syllabus. Every number, chart and prediction is computed from the dataset you upload.

---

## Table of contents

1. [Project title](#1-project-title)
2. [Problem statement](#2-problem-statement)
3. [Objectives](#3-objectives)
4. [Unit-2 syllabus mapping](#4-unit-2-syllabus-mapping)
5. [Dataset information](#5-dataset-information)
6. [Kaggle dataset link](#6-kaggle-dataset-link)
7. [Technologies used](#7-technologies-used)
8. [Architecture](#8-architecture)
9. [Methodology](#9-methodology)
10. [Data preprocessing](#10-data-preprocessing)
11. [TF-IDF](#11-tf-idf)
12. [Support Vector Machine](#12-support-vector-machine)
13. [Kernel trick](#13-kernel-trick)
14. [Bayesian Logistic Regression](#14-bayesian-logistic-regression)
15. [Model evaluation](#15-model-evaluation)
16. [Linear Regression demonstration](#16-linear-regression-demonstration)
17. [Ridge Regression](#17-ridge-regression)
18. [Installation](#18-installation)
19. [Running instructions](#19-running-instructions)
20. [Dataset upload instructions](#20-dataset-upload-instructions)
21. [Project structure](#21-project-structure)
22. [API endpoints](#22-api-endpoints)
23. [Screenshots](#23-screenshots)
24. [Results](#24-results)
25. [Limitations](#25-limitations)
26. [Future scope](#26-future-scope)
27. [References](#27-references)
28. [Google Drive organisation and submission links](#28-google-drive-organisation-and-submission-links)

---

## 1. Project title

**Support Vector Machines for SMS Spam Detection in Telecommunications**

Structure required by the course: **[ML Technique]** Support Vector Machines + **[Task]** SMS Spam Detection + **[Domain]** Telecommunications.

## 2. Problem statement

Telecom subscribers receive large volumes of unsolicited SMS messages that advertise, trick users into calling premium-rate numbers or try to steal personal and banking details. Manually written filtering rules are easy to evade and block genuine messages. The goal is to build a machine-learning system that learns from labelled SMS messages and automatically classifies new messages as **ham** or **spam**, with honest, measured evaluation.

## 3. Objectives

1. Load and validate the SMS Spam Collection dataset through a web interface.
2. Clean the text and convert it into numerical TF-IDF features without data leakage.
3. Train a Support Vector Machine as the main spam classifier and study linear, RBF and polynomial kernels.
4. Tune SVM hyperparameters with cross-validation on the training set.
5. Implement Bayesian Logistic Regression using the MAP estimate and the Laplace approximation.
6. Evaluate both models with accuracy, precision, recall, F1-score, specificity, ROC-AUC and confusion matrices.
7. Classify any SMS typed by the user in real time.
8. Demonstrate the Unit-2 regression practical (least squares / maximum likelihood, robust, polynomial, ridge and Bayesian linear regression) in a clearly separate module.

## 4. Unit-2 syllabus mapping

| Unit-2 concept | Project demonstration | Type |
|---|---|---|
| Maximum Likelihood Estimation | Linear regression: Gaussian-noise likelihood, ML noise variance σ²_ML | Computed + theory |
| Least Squares | Normal-equation solution computed with NumPy and checked against scikit-learn | Computed |
| Robust Linear Regression | Huber regression vs OLS, optional synthetic-outlier test | Computed |
| Ridge Regression | OLS vs ridge coefficients, regularisation path, test error vs λ | Computed |
| Bayesian Linear Regression | `BayesianRidge` with predictive mean and standard deviation | Computed |
| Linear Models for Classification | Linear SVM and logistic regression | Computed |
| Discriminant Function | SVM decision function f(x) = wᵀx + b and a 2-D decision-boundary plot | Computed + theory |
| Probabilistic Generative Models | Multinomial Naive Bayes reference model, measured against the discriminative models | Computed + theory |
| Probabilistic Discriminative Models | Logistic regression models p(spam \| x) directly | Computed |
| Laplacian Approximation | Gaussian posterior N(w_MAP, S) from the Hessian at the MAP estimate | Computed |
| Bayesian Logistic Regression | Second classifier with moderated (probit-approximated) predictive probabilities | Computed |
| Kernel Functions | Linear, RBF and polynomial kernels | Computed |
| Using Kernels in GLMs / Kernel Trick | Kernel SVM explanation and kernel experiment | Computed + theory |
| Support Vector Machines | Main SMS spam classifier | Computed |
| Practical 1: linear regression for prediction | Separate regression module (predicts SMS length from word count) | Computed |
| Practical 2: Bayesian logistic regression and SVM | SVM, Bayesian LR and their comparison | Computed |

## 5. Dataset information

**SMS Spam Collection Dataset** (UCI Machine Learning, hosted on Kaggle). A public set of English SMS messages, each labelled `ham` or `spam`. The Kaggle page describes 5,574 messages; the dashboard always reports the exact number of rows it actually reads from your file.

The Kaggle file `spam.csv`:

| Column | Meaning |
|---|---|
| `v1` | label (`ham` / `spam`) |
| `v2` | SMS text |
| `Unnamed: 2`, `Unnamed: 3`, `Unnamed: 4` | almost always empty (overflow from commas); ignored automatically |

The file is encoded as Latin-1, not UTF-8. The app tries UTF-8 first and falls back to Latin-1 automatically. It also accepts the original tab-separated UCI file (`SMSSpamCollection`) and header-less files.

A small sample file, `data/sample_sms.csv` (116 short messages written for this project), is loaded automatically at start-up so the website works before the real dataset is uploaded. **Sample-file results are for testing only; use the Kaggle file for the project results.**

## 6. Kaggle dataset link

https://www.kaggle.com/uciml/sms-spam-collection-dataset

## 7. Technologies used

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (no frameworks), Plotly.js for interactive charts (bundled locally in `static/js/vendor/`, CDN fallback) |
| Backend | Python 3, Flask |
| Data / ML | Pandas, NumPy, SciPy, scikit-learn |
| Communication | JSON REST API called with `fetch()` |

## 8. Architecture

```text
 Browser (index.html + style.css + script.js)
        |  fetch() JSON requests
        v
 Flask server (app.py)
   ├── /api/upload ─► read CSV ─► detect columns ─► validate & clean ─► de-duplicate
   │                     ─► stratified 80/20 split ─► TF-IDF (fit on train only)
   │                     ─► train SVM + Bayesian LR ─► store in server memory
   ├── analysis endpoints: overview, preview, preprocess, eda, tfidf
   ├── model endpoints: train-svm, svm-boundary, kernel-experiment, tune-svm,
   │                    train-bayesian-logistic, metrics, compare-models, confusion-matrix
   ├── /api/predict ─► same vectorizer ─► SVM decision score + Bayesian probability
   └── regression demos: linear-regression, polynomial, ridge
```

Models are held in memory (the `State` object in `app.py`). Uploading a new file or resetting to the sample retrains everything automatically. Nothing is retrained when you simply browse the page.

## 9. Methodology

1. **Validation and cleaning** – detect label/text columns, normalise labels (`HAM `, `Spam` → `ham`, `spam`), remove missing values, empty messages and rows with unexpected labels.
2. **De-duplication** – duplicate messages are counted and shown, then removed before splitting so the same text can never be in both the training and the test set.
3. **Split** – stratified 80/20 train/test split with `random_state=42` (reproducible).
4. **Features** – TF-IDF vectorizer is **fitted on the training messages only**; test messages are only transformed. This prevents data leakage.
5. **Models** – SVM (main) and Bayesian Logistic Regression trained on the same training set.
6. **Tuning** – grid search with stratified 3-fold cross-validation **inside the training set**; TF-IDF is part of the pipeline so it is re-fitted on each fold.
7. **Evaluation** – all metrics come from the untouched test set.
8. **Prediction** – live messages pass through exactly the same preprocessing and vectorizer.

## 10. Data preprocessing

The same function (`preprocess_text` in `app.py`) is used for training, testing and live prediction:

1. Decode HTML codes (`&lt;` → `<`, `&amp;` → `&`). The real dataset contains placeholders such as `&lt;#&gt;`; without this step "lt" and "gt" become the most frequent ham "words".
2. Convert to lowercase.
3. Replace web links with `url` and currency symbols (£ $ € ₹) with `money`.
4. Remove punctuation and symbols (letters, digits and spaces are kept; digits are useful spam signals such as premium phone numbers).
5. Collapse extra whitespace.
6. Remove English stopwords (inside the TF-IDF vectorizer, scikit-learn's list).

The website shows a step-by-step before/after example for real messages from the loaded dataset.

## 11. TF-IDF

**TF-IDF converts text into numerical features that the machine-learning model can use.**

- TF: how often a term appears in a message (sublinear scaling 1 + log tf).
- IDF: idf(t) = ln((1 + N) / (1 + df(t))) + 1, so rare terms get larger weights.
- Settings: unigrams and bigrams, English stopwords removed, `min_df=2` for datasets with at least 500 training messages, maximum 5,000 features, each row L2-normalised.
- The result is a sparse matrix. The website shows the number of features, matrix shapes, sparsity, a vocabulary sample, the most common/rarest terms and one message's non-zero weights.

## 12. Support Vector Machine

- **Hyperplane / discriminant function:** f(x) = wᵀx + b; f(x) > 0 → spam, f(x) < 0 → ham.
- **Margin:** the SVM maximises the margin 2/‖w‖ between the classes.
- **Soft margin:** minimise ½‖w‖² + C Σ ξₙ subject to tₙ f(xₙ) ≥ 1 − ξₙ. C trades margin width against training errors.
- **Support vectors:** the training points on or inside the margin; they alone define the boundary. Their count is reported.
- Implementation: `sklearn.svm.SVC` with selectable kernel, C, gamma and optional balanced class weights.
- For the linear kernel, the largest positive and negative weights (the strongest spam and ham terms) are displayed.
- A 2-D visualisation projects TF-IDF vectors with Truncated SVD and trains a separate SVM on that projection only to draw the boundary, margins and support vectors. This is clearly labelled as a visualisation; the real model uses all features.

## 13. Kernel trick

The dual form of the SVM uses only dot products, so they can be replaced by a kernel k(x, x′) = φ(x)ᵀφ(x′):

f(x) = Σₙ aₙ tₙ k(xₙ, x) + b

| Kernel | Formula | Notes |
|---|---|---|
| Linear | xᵀx′ | Usually strong for sparse, high-dimensional text |
| RBF | exp(−γ‖x − x′‖²) | Flexible, non-linear |
| Polynomial | (γ xᵀx′ + 1)², degree 2 | Higher degrees on unit-length TF-IDF vectors give very small similarities, so degree 2 with coef0 = 1 is used |

The kernel experiment trains all three on the same split and reports measured accuracy, precision, recall, F1, ROC-AUC, support-vector count and training time. No kernel is claimed to be universally better.

## 14. Bayesian Logistic Regression

Implemented explicitly in `train_blr_into()` in `app.py` (it is **not** scikit-learn's `LogisticRegression` relabelled as Bayesian):

| Step | Formula |
|---|---|
| Likelihood | p(t \| w) = Πₙ yₙ^tₙ (1 − yₙ)^(1−tₙ), yₙ = σ(wᵀxₙ) |
| Prior | w ~ N(0, σ²ₚ I); intercept ~ N(0, 100) |
| Posterior | p(w \| D) ∝ p(D \| w) p(w) — no closed form |
| MAP estimate | minimise Σ [ln(1 + e^aₙ) − tₙaₙ] + ‖w‖²/(2σ²ₚ) with L-BFGS and the exact gradient |
| Laplace approximation | q(w) = N(w_MAP, S), S⁻¹ = Σ yₙ(1 − yₙ) xₙxₙᵀ + I/σ²ₚ |
| Predictive probability | p(spam \| x) ≈ σ(κ(s²) μ), μ = w_MAPᵀx, s² = xᵀSx, κ = (1 + πs²/8)^(−½) |

**Approximation honestly stated:** the full covariance S is a (k+1)×(k+1) matrix, so the k most informative TF-IDF features (default 1,000, chi-square test on the training set only) are used for this model. With a 0.5 threshold the moderated probability gives the same class as MAP (κ only shrinks the activation); the probabilities, log loss and ROC-AUC differ. The website shows MAP weights with 95% credible intervals, prior-vs-posterior curves, and test messages where the Bayesian and MAP probabilities differ most.

**Generative vs discriminative (measured):** a generative model models p(x | class) and p(class) and applies Bayes' theorem; logistic regression and the SVM model the decision boundary directly. A Multinomial Naive Bayes classifier is trained on the same TF-IDF features as a generative reference, and its test metrics are shown next to both discriminative models.

## 15. Model evaluation

Spam is the positive class. All metrics are computed on the held-out test set:

- **Accuracy** (TP + TN) / total
- **Precision** TP / (TP + FP) — how many flagged messages were really spam
- **Recall** TP / (TP + FN) — how much spam was caught
- **F1-score** — harmonic mean of precision and recall
- **Specificity** TN / (TN + FP) — how many ham messages were left alone
- **ROC-AUC** — from the SVM decision score and the Bayesian predictive probability
- **Confusion matrix** with TN, FP, FN, TP and examples of misclassified messages

**Precision–recall curves and threshold explorer:** PR curves with average precision for both models, plus a slider that shows precision, recall, F1 and the FP/FN counts of Bayesian LR at thresholds from 0.05 to 0.95.

**Cross-validation check:** stratified 5-fold cross-validation repeats the whole pipeline (TF-IDF + both models refitted inside every fold) on the unique messages and reports mean ± standard deviation, showing how stable the single-split result is. Results are cleared automatically when a model is retrained with new settings.

**Exports:** `test_set_predictions.csv` (every test message with both models' predictions and scores) and `results_summary.json` (all measured results of the run) can be downloaded from the Key findings section as additional proof.

**Why accuracy alone is not enough:** the dataset is imbalanced (far more ham than spam). The dashboard computes the accuracy of a model that always predicts "ham" on the actual test set to show this.

## 16. Linear Regression demonstration

A separate module for Practical 1. It does **not** classify spam.

- Task: predict an SMS's character length from its word count, using the loaded messages.
- Least squares solved with the normal equations w = (ΦᵀΦ)⁻¹Φᵀt (NumPy) and checked against scikit-learn.
- Maximum likelihood link: with Gaussian noise, maximising the log-likelihood equals minimising the sum of squared errors; σ²_ML is reported.
- Robust regression: Huber regression vs OLS, with an optional checkbox that adds 5% synthetic outliers to the training set only (clearly labelled).
- Outputs: training/test data, actual vs predicted values, MAE, RMSE, R² (train and test).
- Polynomial basis functions (degrees 1–8): training and test RMSE vs degree to show overfitting.

## 17. Ridge Regression

- Task: predict SMS length from five standardised features (word count, average word length, digit count, uppercase count, punctuation count).
- Compares OLS and ridge coefficients, coefficient norm ‖w‖ and test error for a chosen λ.
- Plots the regularisation path (coefficients vs λ) and test RMSE vs λ.
- Bayesian linear regression (`BayesianRidge`) reports estimated noise precision α, weight precision λ and predictive standard deviations.

## 18. Installation

Requirements: **Python 3.9 or newer**.

```bash
# Open a terminal in the project folder, then run:
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

## 19. Running instructions

```bash
python app.py
```

Open **http://127.0.0.1:5000** in a browser.

On Windows you can simply double-click **`run.bat`** (creates the virtual environment, installs packages, starts the server and opens the browser). On macOS/Linux run `bash run.sh`.

At start-up the console prints `Sample dataset loaded and models trained`. Stop the server with `Ctrl + C`.

## 20. Dataset upload instructions

1. Sign in to Kaggle and open https://www.kaggle.com/uciml/sms-spam-collection-dataset.
2. Click **Download** and unzip; you get `spam.csv`.
3. In the dashboard, go to **3 · Dataset upload**, choose `spam.csv` (or drag it onto the box) and click **Upload and train**.
4. The message **Dataset uploaded successfully** appears with a validation report. Every section refreshes with results from the real dataset.
5. If the columns cannot be detected automatically, choose the label and text columns from the drop-downs and click **Use these columns**.
6. **Reset to sample dataset** returns to the built-in sample.

Upload limit: 25 MB. Accepted extensions: `.csv`, `.txt`, `.tsv`.

## 21. Project structure

```text
SMS Spam Intelligence Dashboard/
│
├── app.py                  Flask backend: all ML logic and API endpoints
├── requirements.txt        Python dependencies
├── README.md               This documentation
├── run.bat                 One-click start for Windows
├── run.sh                  Start script for macOS / Linux
├── .gitignore
│
├── templates/
│   └── index.html          Single-page dashboard
│
├── static/
│   ├── css/
│   │   └── style.css       Styling (light + dark theme, responsive)
│   └── js/
│       ├── script.js       Frontend logic (fetch calls, rendering, charts)
│       └── vendor/
│           └── plotly.min.js   Plotly.js 2.35.2 (MIT licence), for offline charts
│
├── data/
│   ├── sample_sms.csv      Small sample dataset (works before upload)
│   └── README.txt          How to get the Kaggle dataset
│
└── models/
    └── README.txt          Models are kept in memory; nothing large is committed
```

## 22. API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Dashboard page |
| GET | `/api/status` | Loaded dataset, current model settings |
| POST | `/api/upload` | Upload CSV (`file`), optional `label_col`, `text_col`; validates and retrains |
| POST | `/api/reset` | Reload the sample dataset and retrain |
| GET | `/api/overview` | Totals, class counts and percentages, duplicates, missing values, split sizes |
| GET | `/api/preview` | Paged table; query `page`, `per_page`, `search`, `label` (`all`/`ham`/`spam`) |
| GET | `/api/preprocess` | Step-by-step cleaning examples |
| GET | `/api/eda` | Class counts, message lengths, top words |
| GET | `/api/tfidf` | Feature counts, matrix shapes, sparsity, vocabulary samples |
| GET / POST | `/api/train-svm` | GET current results; POST `{kernel, C, gamma, balanced}` to retrain |
| GET | `/api/svm-boundary` | 2-D decision boundary visualisation data |
| GET / POST | `/api/kernel-experiment` | POST trains and compares linear, RBF, polynomial kernels; GET returns the last result |
| GET / POST | `/api/tune-svm` | POST runs grid search with cross-validation and applies the best settings; GET returns the last result |
| GET / POST | `/api/cross-validate` | POST runs stratified 5-fold CV for both models; GET returns the last result |
| GET / POST | `/api/train-bayesian-logistic` | GET current results; POST `{prior_variance, n_features}` to retrain |
| GET | `/api/metrics` | Test-set metrics for both models and the majority-class baseline |
| GET | `/api/compare-models` | Side-by-side comparison, ROC and precision–recall curves, threshold table, Naive Bayes reference |
| GET | `/api/confusion-matrix` | TN/FP/FN/TP for both models and misclassified examples |
| POST | `/api/predict` | `{message}` → SVM label + decision score, Bayesian probabilities |
| GET | `/api/linear-regression` | Least squares, ML variance, Huber; query `outliers=1` |
| GET | `/api/polynomial` | Polynomial degrees 1–8: errors and fitted curves |
| GET | `/api/ridge` | OLS vs ridge vs Bayesian ridge; query `alpha` |
| GET | `/api/findings` | Automatically generated findings |
| GET | `/api/export/predictions` | Download test-set predictions as CSV |
| GET | `/api/export/summary` | Download all measured results as JSON |

All endpoints return JSON with `"ok": true` or `"ok": false` and a readable `"error"` message.

## 23. Screenshots

Capture these after uploading the Kaggle `spam.csv` and add them to the screenshots PDF (and optionally to a `screenshots/` folder in this repository):

| # | Screen | Dashboard section |
|---|---|---|
| 1 | Project homepage | Header + 1 |
| 2 | Dataset upload and successful loading | 3 |
| 3 | Dataset overview | 4 |
| 4 | Dataset preview | 5 |
| 5 | Text preprocessing | 6 |
| 6 | Class distribution | 7 (top) |
| 7 | Message-length EDA | 7 (middle) |
| 8 | TF-IDF feature extraction | 8 |
| 9 | SVM training/results | 9 |
| 10 | Kernel comparison | 10 |
| 11 | Bayesian Logistic Regression | 11 |
| 12 | SVM vs Bayesian LR comparison | 12 |
| 13 | Confusion matrix | 13 |
| 14 | Linear Regression demonstration | 14 |
| 15 | Ridge Regression | 15 |
| 16 | Live SMS classification | 16 |
| 17 | Key findings / conclusion | 17–18 |

<!-- Example after adding images:
![Homepage](screenshots/01_homepage.png)
-->

## 24. Results

Results depend on the dataset you upload and are produced by the running application; **none are hard-coded**. After uploading the Kaggle file, copy the measured values from sections 12, 13 and 17 of the dashboard into this table:

| Metric (test set) | SVM | Bayesian Logistic Regression |
|---|---|---|
| Accuracy | _fill in from dashboard_ | _fill in from dashboard_ |
| Precision | _fill in_ | _fill in_ |
| Recall | _fill in_ | _fill in_ |
| F1-score | _fill in_ | _fill in_ |
| ROC-AUC | _fill in_ | _fill in_ |
| Confusion matrix (TN, FP, FN, TP) | _fill in_ | _fill in_ |

SVM settings used: _kernel, C, gamma_. Test-set size: _n_. Number of TF-IDF features: _n_.

## 25. Limitations

- English-only and relatively old messages; modern scam styles and regional languages are under-represented.
- The headline results come from one stratified train/test split; the built-in 5-fold cross-validation shows how much they vary.
- The Bayesian model uses a selected subset of features so that the full Laplace covariance can be computed.
- Models live in server memory and are lost when the server stops (they retrain in seconds on start-up/upload).
- The Flask development server is meant for local demonstration, not production traffic.

## 26. Future scope

- Multilingual and code-mixed SMS data.
- Character n-grams to handle deliberate misspellings (e.g. "fr33").
- Decision-threshold tuning to control false positives for operators.
- Statistical significance tests between models (e.g. McNemar's test).
- Deployment as an operator-side filtering API with model persistence (`joblib`) and monitoring.

## 27. References

1. Almeida, T. A., Gómez Hidalgo, J. M., & Yamakami, A. (2011). Contributions to the study of SMS spam filtering: new collection and results. *Proceedings of the 11th ACM Symposium on Document Engineering (DocEng '11)*.
2. UCI Machine Learning. *SMS Spam Collection Dataset*. Kaggle. https://www.kaggle.com/uciml/sms-spam-collection-dataset
3. Bishop, C. M. (2006). *Pattern Recognition and Machine Learning*. Springer. (Ch. 3 linear models for regression, Ch. 4 linear models for classification and the Laplace approximation, Ch. 6 kernel methods, Ch. 7 sparse kernel machines / SVM.)
4. Cortes, C., & Vapnik, V. (1995). Support-vector networks. *Machine Learning*, 20(3), 273–297.
5. Pedregosa, F., et al. (2011). Scikit-learn: Machine learning in Python. *Journal of Machine Learning Research*, 12, 2825–2830.
6. Murphy, K. P. (2012). *Machine Learning: A Probabilistic Perspective*. MIT Press.
7. Flask documentation: https://flask.palletsprojects.com/ ; Plotly.js documentation: https://plotly.com/javascript/

## 28. Google Drive organisation and submission links

```text
ML Unit 2 Project
│
├── Dataset
│   └── SMS Spam Collection.csv        (the Kaggle spam.csv)
│
├── GitHub Project Code
│   └── complete project               (zip of this repository)
│
├── Output Screenshots
│   └── Unit2_Output_Screenshots.pdf
│
├── PPT
│   └── Unit2_ML_Project_Presentation.pptx
│
└── Additional Proof
    └── supporting material            (test_set_predictions.csv, results_summary.json,
                                        screen recording of the live demo)
```

Share the folder as "Anyone with the link can view" (or add your teacher's email) so it can be verified.

| Item | Link |
|---|---|
| Dataset Link | [Kaggle SMS Spam Collection Dataset](https://www.kaggle.com/uciml/sms-spam-collection-dataset) |
| GitHub Project Link | Not published yet |
| Output Screenshots PDF | Not added yet |
| PPT | Not added yet |
| Complete Google Drive Folder | Not shared yet |
