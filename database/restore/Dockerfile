FROM mariadb:11.8.9

WORKDIR /restore

COPY seed/langnation-capstone-sanitized.sql /restore/langnation-capstone-sanitized.sql
COPY restore/restore.sh /restore/restore.sh

RUN chmod 700 /restore/restore.sh

ENTRYPOINT ["/restore/restore.sh"]
