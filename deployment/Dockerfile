FROM java:8

WORKDIR /

RUN mkdir -p /home/service && \
	groupadd -r service -g 433 && \
	useradd -u 431 -r -g service -d /home/service -s /sbin/nologin -c "service user" service && \
	chown -R service:service /home/service

# Install app
USER service

ADD microservice/target/currency-exchange-service-0.0.1-SNAPSHOT.jar  /opt/currency_exchange.jar

EXPOSE 8000

CMD java  -Xms210m -Xmx210m  -jar /opt/currency_exchange.jar
