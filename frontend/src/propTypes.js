import PropTypes from "prop-types";
import { readingStatuses } from "./savedPaperRequest.js";

const paperIdentityFields = {
  openAlexId: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
};
const author = PropTypes.shape({ name: PropTypes.string }).isRequired;

export const paperIdentity = PropTypes.shape(paperIdentityFields);

export const listedPaper = PropTypes.shape({
  ...paperIdentityFields,
  authors: PropTypes.arrayOf(author).isRequired,
  institutions: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string.isRequired }).isRequired)
    .isRequired,
  publicationDate: PropTypes.string.isRequired,
  citedByCount: PropTypes.number,
});

const savedPaperFields = {
  openAlexId: PropTypes.string.isRequired,
  notes: PropTypes.string.isRequired,
  readingStatus: PropTypes.oneOf(Object.keys(readingStatuses)).isRequired,
  revision: PropTypes.number.isRequired,
};

export const savedPaper = PropTypes.shape(savedPaperFields);

export const savedPaperEntry = PropTypes.shape({
  ...savedPaperFields,
  createdAt: PropTypes.string.isRequired,
  paper: PropTypes.shape({
    ...paperIdentityFields,
    authors: PropTypes.arrayOf(author),
    citedByCount: PropTypes.number,
  }),
});

const followedTopicIdentityFields = {
  topicId: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
};

export const followedTopics = PropTypes.arrayOf(
  PropTypes.shape(followedTopicIdentityFields).isRequired,
);

export const followedTopicEntry = PropTypes.shape({
  ...followedTopicIdentityFields,
  note: PropTypes.string.isRequired,
  lastCheckedAt: PropTypes.string,
  revision: PropTypes.number.isRequired,
});
