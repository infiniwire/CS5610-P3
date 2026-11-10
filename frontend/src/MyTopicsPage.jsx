import { useEffect, useState } from "react";
import { useReader } from "./ReaderContext.js";
import { topicRequest } from "./topicRequest.js";
import TopicSearch from "./TopicSearch.jsx";
import FollowedTopicEntry from "./FollowedTopicEntry.jsx";
import RecentTopicPapers from "./RecentTopicPapers.jsx";
import TopicUniversityComparison from "./TopicUniversityComparison.jsx";
import "./MyTopicsPage.css";

export default function MyTopicsPage() {
  const { user, checking, requestSignIn, sessionExpired } = useReader();
  const userId = user?.id;
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    topicRequest("followed-topics", { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ owner: userId, data });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ owner: userId, error: error.message });
        if (error.status === 401) sessionExpired();
      });
    return () => controller.abort();
  }, [userId, attempt, sessionExpired]);
  const current = result?.owner === userId ? result : null;
  const items = current?.data?.followedTopics;
  function reload() {
    setResult(null);
    setAttempt((value) => value + 1);
  }
  function update(item, message) {
    setResult((previous) =>
      !previous?.data
        ? previous
        : {
            ...previous,
            data: {
              followedTopics: previous.data.followedTopics.some(
                (old) => old.topicId === item.topicId,
              )
                ? previous.data.followedTopics.map((old) =>
                    old.topicId === item.topicId ? item : old,
                  )
                : [item, ...previous.data.followedTopics],
            },
          },
    );
    setNotice(message);
  }
  const selectionKey = items?.map((item) => item.topicId).join(",");
  return (
    <section className="research-index my-topics-page" aria-labelledby="my-topics-heading">
      <div className="index-heading">
        <h1 id="my-topics-heading">My Topics</h1>
        <p>Your research category tracker</p>
      </div>
      {checking ? (
        <p role="status">Checking sign-in status…</p>
      ) : !user ? (
        <>
          <p>
            Sign in to follow research topics, keep personal notes, and track recent publications.
          </p>
          <button type="button" onClick={requestSignIn}>
            Sign in
          </button>
        </>
      ) : (
        <>
          <p>
            Follow primary research topics in the PaperPulse index. Topic membership and comparisons
            use <em>primaryTopic</em>, consistent with Analysis and Rankings; secondary tags are
            excluded.
          </p>
          {!current && <p role="status">Loading followed topics…</p>}
          {current?.error && (
            <p role="alert">
              {current.error}{" "}
              <button type="button" onClick={reload}>
                Retry followed topics
              </button>
            </p>
          )}
          {items && (
            <>
              <TopicSearch
                followedTopics={items}
                onFollow={(item) => update(item, "Topic followed.")}
              />
              <section aria-labelledby="followed-topics-heading">
                <h2 id="followed-topics-heading">2. Your followed topics</h2>
                {notice && <p role="status">{notice}</p>}
                {!items.length && (
                  <p role="status">
                    You are not following any topics. Search above and select Follow to get started.
                  </p>
                )}
                {items.map((item) => (
                  <FollowedTopicEntry
                    key={`${item.topicId}:${item.revision}`}
                    item={item}
                    onChange={(item) => update(item, "Followed topic updated.")}
                    onRemove={(id) => {
                      setResult((previous) => ({
                        ...previous,
                        data: {
                          followedTopics: previous.data.followedTopics.filter(
                            (item) => item.topicId !== id,
                          ),
                        },
                      }));
                      setNotice("Topic unfollowed.");
                    }}
                    onReload={reload}
                  />
                ))}
              </section>
              {items.length > 0 && (
                <>
                  <RecentTopicPapers key={`recent:${selectionKey}`} followedTopics={items} />
                  <TopicUniversityComparison
                    key={`universities:${selectionKey}`}
                    followedTopics={items}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
