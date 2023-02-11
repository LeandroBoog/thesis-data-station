import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TaintReportModel } from '../db/models/taint-report.model';
import { WebsiteModel } from '../db/models/website.model';
import { CookieModel } from '../db/models/cookie.model';

import { CreateWebsiteDto } from './dto/validation/create-website.dto';
import { CreateCrawlSessionDto } from './dto/validation/create-crawl-session.dto';
import { CrawlSessionModel } from '../db/models/crawl-session.model';
import { SessionEntity } from './entities/session.entity';

@Injectable()
export class TaintReportService {
  constructor(
    @InjectRepository(CrawlSessionModel)
    private crawlSessionRepository: Repository<CrawlSessionModel>,
    @InjectRepository(TaintReportModel)
    private taintReportRepository: Repository<TaintReportModel>,
    @InjectRepository(WebsiteModel)
    private websiteRepository: Repository<WebsiteModel>,
    @InjectRepository(CookieModel)
    private cookieRepository: Repository<CookieModel>,
  ) {}

  async getLatestCrawlSession() {
    const orderedByCreationDate = await this.crawlSessionRepository.find({
      order: { createdAt: 'desc' },
    });
    return new SessionEntity(orderedByCreationDate[0]);
  }

  async createCrawlSession(createCrawlSession: CreateCrawlSessionDto) {
    const newCrawlSession =
      this.crawlSessionRepository.create(createCrawlSession);
    newCrawlSession.websites = [];
    return new SessionEntity(
      await this.crawlSessionRepository.save(newCrawlSession),
    );
  }

  async createWebsiteEntry(createWebsiteDto: CreateWebsiteDto) {
    const doesSessionExist = await this.sessionExists(createWebsiteDto);
    if (!doesSessionExist) return undefined;

    const doesWebsiteAlreadyExist = await this.websiteExistsInSession(
      createWebsiteDto,
    );
    if (!doesWebsiteAlreadyExist) {
      return await this.addNewWebsiteToSession(createWebsiteDto);
    } else {
      return await this.addDataToWebsiteOfSession(createWebsiteDto);
    }
  }

  async sessionExists({ crawlSessionId }) {
    return !!(await this.crawlSessionRepository.findOne({
      where: { id: crawlSessionId },
    }));
  }

  async websiteExistsInSession({ crawlSessionId, url }) {
    return !!(await this.websiteRepository
      .createQueryBuilder('website')
      .leftJoinAndSelect('website.crawlSession', 'crawlSession')
      .where('website.crawlSession = :crawlSessionId', {
        crawlSessionId,
      })
      .andWhere('website.url = :url', {
        url,
      })
      .getOne());
  }

  async addNewWebsiteToSession({ url, crawlSessionId, taintReports, cookies }) {
    const newWebsite = await this.websiteRepository.create({
      url,
      taintReports,
      cookies,
    });
    const crawlSession = await this.crawlSessionRepository.findOne({
      relations: ['websites'],
      where: { id: crawlSessionId },
    });
    crawlSession.websites.push(newWebsite);
    await this.crawlSessionRepository.save(crawlSession);

    return {
      id: newWebsite.id,
      url,
    };
  }

  async addDataToWebsiteOfSession({
    url,
    crawlSessionId,
    taintReports,
    cookies,
  }) {
    const website = await this.websiteRepository.findOne({
      relations: {
        crawlSession: true,
        taintReports: true,
        cookies: true,
      },
      where: {
        crawlSession: {
          id: crawlSessionId,
        },
        url,
      },
    });
    const newTaintReports = this.taintReportRepository.create(taintReports);
    website.taintReports.push(...newTaintReports);
    const newCookies = this.cookieRepository.create(cookies);
    website.cookies.push(...newCookies);
    await this.websiteRepository.save(website);

    return {
      id: website.id,
      url,
    };
  }
}
