# Testing the reader on real reports, in the languages tenants use

Every reader result in the report so far comes from synthetic English. Before ReachNT reads a single real report on its own, it has to be tested on real ones, including Aboriginal English, Kriol and the other languages tenants speak. This is how.

## Who does it

- **The housing department** provides past repair reports and owns the work.
- **The Aboriginal Interpreter Service (AIS)** transcribes and translates reports that were made in language, and checks the labels.
- **A housing maintenance officer** with remote experience decides the true fault for each report.
- **Community organisations and land councils** agree to the use of the reports before anything starts. Without that agreement, it doesn't start.

Ethics approval (HREC) and land council research permits come first, as the report recommends.

## What to collect

1. **About 1,000 past reports** from at least four regions. Sample so that every language group has at least 100 reports and every fault type has at least 20.
2. **The words as the tenant said them,** not a staff summary. For phone reports, use the call-centre notes where they quote the tenant, or record (with consent) and transcribe.
3. **Remove names, phone numbers and addresses** before the file leaves the department. The scoring script refuses any file where a row looks like it contains a mobile number or street address.
4. **Two people label each report independently** with the true fault (the keys in `config/taxonomy.yaml`): an AIS interpreter and a maintenance officer. Where they disagree, a third person decides, and the disagreement rate is reported too. If two experts disagree often on a fault, the fault list needs work, not the reader.
5. **Hold back a third of the reports** from anyone tuning the word rules. Tune on two thirds; report results only on the held-back third.

## How to score it

```bash
python scripts/evaluate_real_reports.py reports.csv
```

Columns: `text`, `true_hazard`, `language`, `reviewed_by`. The script reports, for each language and overall:
- dangerous reports caught (labelled Immediate, or sent to a person);
- dangerous reports labelled Immediate straight away;
- category accuracy and macro-F1;
- the share sent to a person.

It also lists every dangerous report missed and every fault the reader has no category for.

## Pass marks for a pilot (agree these before scoring)

| Measure | Pass mark |
|---|---|
| Dangerous reports caught by the system, every language | All of them. One miss means the rules are fixed and the held-back set is re-scored. |
| Share sent to a person | Low enough that staff can call each one back the same day (set with the call centre) |
| Category accuracy for reports the system read on its own | At least 90%, in every language group with 100+ reports |
| Gap between the best and worst language group | Reported, and closed before the pilot widens |

## Reporting

Report the results using the TRIPOD+AI checklist (BMJ 2024): the data source, who labelled it, how the held-back set was kept apart, results by language group, and what failed. Publish the summary with the AI transparency statement.

## After the pilot starts

The weekly audit in the portal (the Checks tab: a person re-reads 1 in 20 reports the program read on its own) keeps measuring the same thing. A rise in the share sent to a person, or in audit misses for one language group, is the signal to add words to the rules.
