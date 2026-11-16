import PropTypes from "prop-types";

export const namedCounts = PropTypes.arrayOf(
  PropTypes.shape({
    name: PropTypes.string.isRequired,
    count: PropTypes.number.isRequired,
  }).isRequired,
).isRequired;

export const topicCounts = PropTypes.arrayOf(
  PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    count: PropTypes.number.isRequired,
  }).isRequired,
).isRequired;

export const citationBins = PropTypes.arrayOf(
  PropTypes.shape({
    label: PropTypes.string.isRequired,
    count: PropTypes.number.isRequired,
  }).isRequired,
).isRequired;

export const monthlyCounts = PropTypes.arrayOf(
  PropTypes.shape({
    month: PropTypes.string.isRequired,
    count: PropTypes.number.isRequired,
  }).isRequired,
).isRequired;

export const monthlySeries = PropTypes.arrayOf(
  PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    months: monthlyCounts,
  }).isRequired,
).isRequired;

export const universityMetrics = PropTypes.arrayOf(
  PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    count: PropTypes.number.isRequired,
    meanCitations: PropTypes.number,
    citationKnown: PropTypes.number.isRequired,
  }).isRequired,
).isRequired;

export const lorenzPoints = PropTypes.arrayOf(
  PropTypes.shape({
    papers: PropTypes.number.isRequired,
    citations: PropTypes.number.isRequired,
  }).isRequired,
).isRequired;

const countryCitationFields = {
  id: PropTypes.string.isRequired,
  meanCitations: PropTypes.number,
  citations: PropTypes.number.isRequired,
  citationKnown: PropTypes.number.isRequired,
};

export const namedCountryCitations = PropTypes.arrayOf(
  PropTypes.shape({
    ...countryCitationFields,
    name: PropTypes.string.isRequired,
  }).isRequired,
).isRequired;

export const countryAnalysisFields = {
  countryAnalysis: PropTypes.shape({
    groups: PropTypes.arrayOf(
      PropTypes.shape({
        ...countryCitationFields,
        count: PropTypes.number.isRequired,
        cited: PropTypes.number.isRequired,
        months: monthlyCounts,
      }).isRequired,
    ).isRequired,
  }).isRequired,
  monthly: monthlyCounts,
  publicationDateMissing: PropTypes.number.isRequired,
};
