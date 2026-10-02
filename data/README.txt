DATA FOLDER
===========

sample_sms.csv
  A small sample dataset (116 short SMS messages written for this project,
  84 ham and 32 spam, including 2 duplicates). It is loaded automatically
  when the server starts so the dashboard works immediately.
  Results on this file are only for testing the application.

Real project dataset
  SMS Spam Collection Dataset (UCI Machine Learning, on Kaggle)
  https://www.kaggle.com/uciml/sms-spam-collection-dataset

  1. Sign in to Kaggle, open the link above and click "Download".
  2. Unzip the download to get spam.csv
     (columns: v1 = label ham/spam, v2 = message text,
      plus three mostly empty "Unnamed" columns that are ignored).
  3. Start the app (python app.py), open http://127.0.0.1:5000
     and upload spam.csv in section 3 "Dataset upload".

  You may keep a copy of spam.csv in this folder for convenience.
  It is listed in .gitignore so it is not pushed to GitHub by default;
  link to Kaggle instead (the dataset link is part of the submission).

Expected format for any other CSV
  One column with the labels ham / spam (any capitalisation) and one column
  with the message text. Column names do not matter; the app detects them,
  or lets you choose them manually.
